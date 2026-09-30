/**
 * Privacy-Preserving Telemetry & Client-Side Error Scrubber
 * 
 * System Invariant 1: Zero Data Egress
 * Unencrypted transaction figures, merchants, account numbers, URLs, and balances
 * must NEVER leave client memory. Telemetry payloads are strictly constrained
 * to whitelisted error codes and non-sensitive metadata buckets.
 */

export type TelemetryErrorCode =
  | "PARSER_FAIL_NO_LAYOUT_MATCH"
  | "WORKER_TIMEOUT_EXCEEDED"
  | "PASSWORD_REQUIRED"
  | "PASSWORD_INCORRECT"
  | "SCANNED_PDF_NO_TEXT"
  | "RECONCILIATION_UNBALANCED"
  | "PARSER_GATEKEEPER_REJECTED"
  | "DEXIE_STORAGE_ERROR"
  | "NETWORK_OFFLINE"
  | "CSV_PARSE_FAILED"
  | "PDF_LOAD_FAILED"
  | "UNAUTHORIZED_ACCESS"
  | "UNKNOWN_CLIENT_ERROR";

export interface ScrubbedTelemetryEvent {
  code: TelemetryErrorCode;
  timestamp: number;
  fileType?: "pdf" | "csv";
  pageBucket?: "1" | "2-10" | "11-50" | ">50";
  transactionBucket?: "0" | "1-50" | "51-200" | "201-1000" | ">1000";
  environment: "browser" | "node" | "worker";
}

/**
 * Whitelist pattern matcher to map an error message to a safe TelemetryErrorCode.
 */
export function classifyTelemetryErrorCode(error: unknown): TelemetryErrorCode {
  if (!error) return "UNKNOWN_CLIENT_ERROR";

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : (error as any)?.code || "";

  const name = error instanceof Error ? error.name : "";
  const combined = `${name} ${message}`.toLowerCase();

  if (combined.includes("password") || combined.includes("need_password")) {
    if (combined.includes("incorrect") || combined.includes("invalid password")) {
      return "PASSWORD_INCORRECT";
    }
    return "PASSWORD_REQUIRED";
  }

  if (combined.includes("scanned") || combined.includes("zero text spans") || combined.includes("no text")) {
    return "SCANNED_PDF_NO_TEXT";
  }

  if (combined.includes("no layout match") || combined.includes("unrecognized") || combined.includes("unmatched")) {
    return "PARSER_FAIL_NO_LAYOUT_MATCH";
  }

  if (combined.includes("timeout") || combined.includes("deadline")) {
    return "WORKER_TIMEOUT_EXCEEDED";
  }

  if (combined.includes("unbalanced") || combined.includes("discrepancy") || combined.includes("parity")) {
    return "RECONCILIATION_UNBALANCED";
  }

  if (combined.includes("indexeddb") || combined.includes("dexie") || combined.includes("constrainterror")) {
    return "DEXIE_STORAGE_ERROR";
  }

  if (combined.includes("offline") || combined.includes("network")) {
    return "NETWORK_OFFLINE";
  }

  if (combined.includes("csv") && combined.includes("fail")) {
    return "CSV_PARSE_FAILED";
  }

  if (combined.includes("pdf") && combined.includes("fail")) {
    return "PDF_LOAD_FAILED";
  }

  return "UNKNOWN_CLIENT_ERROR";
}

/**
 * Buckets numeric counts into coarse categorical ranges to prevent fingerprinting.
 */
export function bucketCount(
  count: number,
  type: "pages" | "transactions"
): string {
  if (type === "pages") {
    if (count <= 1) return "1";
    if (count <= 10) return "2-10";
    if (count <= 50) return "11-50";
    return ">50";
  } else {
    if (count === 0) return "0";
    if (count <= 50) return "1-50";
    if (count <= 200) return "51-200";
    if (count <= 1000) return "201-1000";
    return ">1000";
  }
}

/**
 * Client-side ring buffer for local audit logging (Zero Data Egress: never sent over network).
 */
const AUDIT_BUFFER_MAX = 50;
const localAuditBuffer: ScrubbedTelemetryEvent[] = [];

/**
 * Client-Side scrubbing function.
 * Strips all URLs, numbers, amounts, merchants, emails, and names.
 */
export function scrubAndRecordTelemetry(
  error: unknown,
  context?: {
    fileType?: "pdf" | "csv";
    pageCount?: number;
    transactionCount?: number;
  }
): ScrubbedTelemetryEvent {
  const code = classifyTelemetryErrorCode(error);

  const event: ScrubbedTelemetryEvent = {
    code,
    timestamp: Date.now(),
    fileType: context?.fileType,
    pageBucket: context?.pageCount !== undefined ? (bucketCount(context.pageCount, "pages") as any) : undefined,
    transactionBucket:
      context?.transactionCount !== undefined
        ? (bucketCount(context.transactionCount, "transactions") as any)
        : undefined,
    environment: typeof window !== "undefined" ? "browser" : "node",
  };

  localAuditBuffer.unshift(event);
  if (localAuditBuffer.length > AUDIT_BUFFER_MAX) {
    localAuditBuffer.pop();
  }

  return event;
}

/**
 * Returns recent scrubbed audit events from local memory for debugging without data leakage.
 */
export function getLocalAuditEvents(): readonly ScrubbedTelemetryEvent[] {
  return [...localAuditBuffer];
}

/**
 * Clears the local telemetry buffer.
 */
export function clearLocalAuditBuffer(): void {
  localAuditBuffer.length = 0;
}
