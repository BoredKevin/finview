"use node";

/**
 * Automated Ingestion Gatekeeper
 * 
 * Convex Action executed on parser submission:
 * 1. Non-Executable Registry: Enforces inert JSON schemas; rejects dynamic scripts & prototype pollution.
 * 2. Strict Zod Schema Validation: Enforces StatementParserConfigSchema and validates static regexes (ReDoS prevention).
 * 3. Isolated Sandbox Execution: Executes the declarative DSL engine against the sanitized fixture in Node.
 * 4. Deterministic Parity & Math Check: Enforces 100% extraction precision and ledger equation parity:
 *    OpeningBalance + Sum(Credits) - Sum(Debits) == ClosingBalance
 * 5. Execution Budget: Terminate validation if execution runtime exceeds 200ms deadline.
 * 6. Audit & State: Marks valid submissions as "verified"; invalid attempts as "rejected" with failure logs.
 */

import { actionGeneric as action } from "convex/server";
import { v } from "convex/values";
import {
  StatementParserConfigSchema,
  StatementParserConfig,
} from "../../../../packages/dsl/schema.js";
import { validateConfigRegexes } from "../../../../packages/dsl/redos.js";
import { clusterSpansIntoRows } from "../../../../packages/dsl/normalizer.js";
import { parsePdfRows, parseCsvRows } from "../../../../packages/dsl/engine.js";
import { verifyLedgerParity } from "../../src/studio/reconciliation/ReconciliationEngine.js";
import { SanitizedFixture } from "../../src/studio/types.js";

export interface ValidationSuccessResult {
  valid: true;
  status: "verified";
  runtimeMs: number;
  transactionCount: number;
  slug: string;
  version: string;
  summary: string;
  reconciliation: {
    openingBalance: string;
    totalCredits: string;
    totalDebits: string;
    closingBalance: string;
    isBalanced: boolean;
  };
}

export interface ValidationFailureResult {
  valid: false;
  status: "rejected";
  runtimeMs: number;
  errors: string[];
  reasons: string[];
}

export type ValidationResult = ValidationSuccessResult | ValidationFailureResult;

/**
 * Strips dangerous prototype properties (__proto__, constructor, prototype)
 * to prevent prototype pollution attacks and code injection.
 */
export function sanitizePrototypeProperties<T>(obj: T): {
  sanitized: T;
  strippedProperties: string[];
  hasPrototypePollutionAttempt: boolean;
} {
  const strippedProperties: string[] = [];
  let hasPrototypePollutionAttempt = false;

  function deepSanitize(val: any, path: string): any {
    if (val === null || val === undefined || typeof val !== "object") {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item, idx) => deepSanitize(item, `${path}[${idx}]`));
    }

    const cleanObj: Record<string, any> = Object.create(null);

    // Inspect own property names as well as dangerous keys
    for (const key of Object.getOwnPropertyNames(val)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        strippedProperties.push(`${path}.${key}`);
        hasPrototypePollutionAttempt = true;
        continue; // Strip key
      }
      cleanObj[key] = deepSanitize(val[key], `${path}.${key}`);
    }

    // Convert back to clean null-prototype object or standard object
    return { ...cleanObj };
  }

  const sanitized = deepSanitize(obj, "root");
  return {
    sanitized,
    strippedProperties,
    hasPrototypePollutionAttempt,
  };
}

/**
 * Pure evaluation function for statement parser submission validation.
 * Can be invoked by the Convex action or tested independently in unit suites.
 */
export async function runSubmissionValidation(
  dslConfigInput: unknown,
  fixtureDataInput: unknown,
  options?: { maxExecutionBudgetMs?: number }
): Promise<ValidationResult> {
  const startTime = performance.now();
  const maxBudgetMs = options?.maxExecutionBudgetMs ?? 200;
  const errors: string[] = [];

  // Helper to check execution budget
  const assertWithinBudget = () => {
    const elapsed = performance.now() - startTime;
    if (elapsed > maxBudgetMs) {
      throw new Error(`Execution budget exceeded ${maxBudgetMs}ms deadline (${elapsed.toFixed(1)}ms elapsed)`);
    }
  };

  try {
    // 1. Safe JSON Deserialization & Raw Input Validation
    let parsedConfig: any;
    // 1. Raw string inspection for prototype pollution keys
    if (typeof dslConfigInput === "string") {
      if (/"(?:__proto__|constructor|prototype)"\s*:/i.test(dslConfigInput)) {
        return {
          valid: false,
          status: "rejected",
          runtimeMs: performance.now() - startTime,
          errors: ["Prototype pollution attempt detected in dslConfig raw JSON string"],
          reasons: ["Malicious payload rejected: prototype pollution"],
        };
      }
      try {
        parsedConfig = JSON.parse(dslConfigInput);
      } catch (err: any) {
        return {
          valid: false,
          status: "rejected",
          runtimeMs: performance.now() - startTime,
          errors: [`Invalid dslConfig JSON: ${err.message}`],
          reasons: ["Malformed JSON payload"],
        };
      }
    } else if (typeof dslConfigInput === "object" && dslConfigInput !== null) {
      parsedConfig = dslConfigInput;
    } else {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: ["dslConfig must be a valid JSON string or object"],
        reasons: ["Invalid input type"],
      };
    }

    let parsedFixture: any;
    if (typeof fixtureDataInput === "string") {
      if (/"(?:__proto__|constructor|prototype)"\s*:/i.test(fixtureDataInput)) {
        return {
          valid: false,
          status: "rejected",
          runtimeMs: performance.now() - startTime,
          errors: ["Prototype pollution attempt detected in fixtureData raw JSON string"],
          reasons: ["Malicious payload rejected: prototype pollution"],
        };
      }
      try {
        parsedFixture = JSON.parse(fixtureDataInput);
      } catch (err: any) {
        return {
          valid: false,
          status: "rejected",
          runtimeMs: performance.now() - startTime,
          errors: [`Invalid fixtureData JSON: ${err.message}`],
          reasons: ["Malformed fixture JSON payload"],
        };
      }
    } else if (typeof fixtureDataInput === "object" && fixtureDataInput !== null) {
      parsedFixture = fixtureDataInput;
    } else {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: ["fixtureData must be a valid JSON string or object"],
        reasons: ["Invalid fixture type"],
      };
    }

    assertWithinBudget();

    // 2. Prototype Pollution Security Gate
    const configSanitization = sanitizePrototypeProperties(parsedConfig);
    if (configSanitization.hasPrototypePollutionAttempt) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: [
          `Prototype pollution attempt detected in dslConfig: stripped properties [${configSanitization.strippedProperties.join(
            ", "
          )}]`,
        ],
        reasons: ["Malicious payload rejected: prototype pollution"],
      };
    }

    const fixtureSanitization = sanitizePrototypeProperties(parsedFixture);
    if (fixtureSanitization.hasPrototypePollutionAttempt) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: [
          `Prototype pollution attempt detected in fixtureData: stripped properties [${fixtureSanitization.strippedProperties.join(
            ", "
          )}]`,
        ],
        reasons: ["Malicious payload rejected: prototype pollution"],
      };
    }

    const cleanConfig = configSanitization.sanitized;
    const cleanFixture: SanitizedFixture = fixtureSanitization.sanitized;

    assertWithinBudget();

    // 3. Strict Zod Schema Parsing against StatementParserConfigSchema
    const zodResult = StatementParserConfigSchema.safeParse(cleanConfig);
    if (!zodResult.success) {
      const formattedErrors = zodResult.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      );
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: formattedErrors,
        reasons: ["Schema validation failure"],
      };
    }
    const validatedConfig: StatementParserConfig = zodResult.data;

    // 4. Static ReDoS Protection Watchdog
    try {
      validateConfigRegexes(validatedConfig);
    } catch (redosErr: any) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: [`ReDoS vulnerability detected in regex configuration: ${redosErr.message}`],
        reasons: ["ReDoS vulnerability detected"],
      };
    }

    assertWithinBudget();

    // 5. Fixture Structure & Content Validation
    if (!cleanFixture || typeof cleanFixture !== "object") {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: ["Fixture must be a non-null object"],
        reasons: ["Invalid fixture payload"],
      };
    }

    if (!Array.isArray(cleanFixture.sanitizedTransactions) || cleanFixture.sanitizedTransactions.length === 0) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: ["Fixture must contain at least one sanitized transaction in sanitizedTransactions"],
        reasons: ["Empty test fixture"],
      };
    }

    if (validatedConfig.meta.fileType !== cleanFixture.fileType) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors: [
          `Config fileType '${validatedConfig.meta.fileType}' does not match fixture fileType '${cleanFixture.fileType}'`,
        ],
        reasons: ["File type mismatch"],
      };
    }

    // 6. Sandboxed Execution of DSL Engine against Fixture
    let extractedTransactions: any[] = [];

    if (validatedConfig.meta.fileType === "pdf") {
      if (!Array.isArray(cleanFixture.anonymizedTextSpans) || cleanFixture.anonymizedTextSpans.length === 0) {
        return {
          valid: false,
          status: "rejected",
          runtimeMs: performance.now() - startTime,
          errors: ["PDF fixtures must provide non-empty anonymizedTextSpans array"],
          reasons: ["Missing PDF fixture spans"],
        };
      }

      // Reconstruct horizontal rows using vertical clustering
      const extractedRows = clusterSpansIntoRows(cleanFixture.anonymizedTextSpans, 3);
      assertWithinBudget();

      // Execute DSL engine in sandbox
      extractedTransactions = await parsePdfRows(
        extractedRows,
        validatedConfig,
        "validation_sandbox_acc",
        {
          accountId: "validation_sandbox_acc",
          config: validatedConfig,
          deadlineMsPerPage: 40,
        }
      );
    } else {
      // CSV Execution
      if (!Array.isArray(cleanFixture.anonymizedCsvRows) || cleanFixture.anonymizedCsvRows.length === 0) {
        return {
          valid: false,
          status: "rejected",
          runtimeMs: performance.now() - startTime,
          errors: ["CSV fixtures must provide non-empty anonymizedCsvRows array"],
          reasons: ["Missing CSV fixture rows"],
        };
      }

      // Execute DSL engine in sandbox
      extractedTransactions = await parseCsvRows(
        cleanFixture.anonymizedCsvRows,
        validatedConfig,
        "validation_sandbox_acc",
        {
          accountId: "validation_sandbox_acc",
          config: validatedConfig,
          deadlineMsPerPage: 40,
        }
      );
    }

    assertWithinBudget();

    // 7. Deterministic Verification: 100% Extraction Precision Match
    if (extractedTransactions.length !== cleanFixture.sanitizedTransactions.length) {
      errors.push(
        `Extraction count mismatch: DSL extracted ${extractedTransactions.length} transactions, fixture asserts ${cleanFixture.sanitizedTransactions.length}`
      );
    }

    const minCount = Math.min(extractedTransactions.length, cleanFixture.sanitizedTransactions.length);
    for (let i = 0; i < minCount; i++) {
      const extracted = extractedTransactions[i];
      const expected = cleanFixture.sanitizedTransactions[i];

      if (extracted.date !== expected.date) {
        errors.push(
          `Row ${i}: date mismatch. Extracted '${extracted.date}', expected '${expected.date}'`
        );
      }

      const extractedAmt = extracted.amountMinorUnits.toString();
      const expectedAmt = expected.amountMinorUnits.toString();
      if (extractedAmt !== expectedAmt) {
        errors.push(
          `Row ${i}: amount minor units mismatch. Extracted ${extractedAmt}, expected ${expectedAmt}`
        );
      }

      if (expected.runningBalanceMinorUnits !== undefined && expected.runningBalanceMinorUnits !== null) {
        const extractedBal = extracted.runningBalanceMinorUnits?.toString() ?? null;
        if (extractedBal !== expected.runningBalanceMinorUnits) {
          errors.push(
            `Row ${i}: running balance mismatch. Extracted ${extractedBal}, expected ${expected.runningBalanceMinorUnits}`
          );
        }
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors,
        reasons: ["Extraction precision mismatch against fixture"],
      };
    }

    assertWithinBudget();

    // 8. Mathematical Parity Verification
    const reconciliation = verifyLedgerParity(extractedTransactions, validatedConfig);

    if (!reconciliation.isBalanced) {
      errors.push(
        `Ledger equation failed: Opening (${reconciliation.openingBalanceMinorUnits}) + Credits (${reconciliation.totalCreditsMinorUnits}) - Debits (${reconciliation.totalDebitsMinorUnits}) != Closing (${reconciliation.closingBalanceMinorUnits}). Discrepancy: ${reconciliation.discrepancyMinorUnits}`
      );
    }

    if (reconciliation.unbalancedRowIndices.length > 0) {
      errors.push(
        `Running balance continuity broke at rows: [${reconciliation.unbalancedRowIndices.join(", ")}]`
      );
    }

    if (reconciliation.malformedDateRowIndices.length > 0) {
      errors.push(
        `Malformed dates detected at rows: [${reconciliation.malformedDateRowIndices.join(", ")}]`
      );
    }

    if (reconciliation.missingBalanceRowIndices.length > 0) {
      errors.push(
        `Missing required balance at rows: [${reconciliation.missingBalanceRowIndices.join(", ")}]`
      );
    }

    if (errors.length > 0) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: performance.now() - startTime,
        errors,
        reasons: ["Mathematical parity failure"],
      };
    }

    const elapsedTotal = performance.now() - startTime;
    if (elapsedTotal > maxBudgetMs) {
      return {
        valid: false,
        status: "rejected",
        runtimeMs: elapsedTotal,
        errors: [`Execution budget exceeded: total runtime was ${elapsedTotal.toFixed(1)}ms (limit: ${maxBudgetMs}ms)`],
        reasons: ["Execution budget exceeded"],
      };
    }

    return {
      valid: true,
      status: "verified",
      runtimeMs: elapsedTotal,
      transactionCount: extractedTransactions.length,
      slug: validatedConfig.meta.bankId,
      version: validatedConfig.meta.version,
      summary: `Verified with 100% extraction precision and ledger parity in ${elapsedTotal.toFixed(1)}ms`,
      reconciliation: {
        openingBalance: reconciliation.openingBalanceMinorUnits?.toString() ?? "0",
        totalCredits: reconciliation.totalCreditsMinorUnits.toString(),
        totalDebits: reconciliation.totalDebitsMinorUnits.toString(),
        closingBalance: reconciliation.closingBalanceMinorUnits?.toString() ?? "0",
        isBalanced: reconciliation.isBalanced,
      },
    };
  } catch (err: any) {
    const elapsed = performance.now() - startTime;
    return {
      valid: false,
      status: "rejected",
      runtimeMs: elapsed,
      errors: [err.message || String(err)],
      reasons: ["Execution error during validation"],
    };
  }
}

/**
 * Convex Action Endpoint: validateSubmission
 * Executed automatically upon submission or calibration test.
 */
export const validateSubmission = action({
  args: {
    parserId: v.optional(v.id("parsers")),
    versionId: v.optional(v.id("parser_versions")),
    slug: v.optional(v.string()),
    dslConfig: v.string(),
    fixtureData: v.string(),
  },
  returns: v.object({
    valid: v.boolean(),
    status: v.union(v.literal("verified"), v.literal("rejected")),
    runtimeMs: v.number(),
    transactionCount: v.optional(v.number()),
    summary: v.optional(v.string()),
    errors: v.array(v.string()),
    reasons: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const result = await runSubmissionValidation(args.dslConfig, args.fixtureData, {
      maxExecutionBudgetMs: 200,
    });

    // If parserId/versionId is provided, persist status updates via mutation
    if (args.parserId) {
      const now = Date.now();
      const status = result.valid ? "verified" : "rejected";
      const log = result.valid
        ? result.summary
        : JSON.stringify(result.errors);

      try {
        // Run mutation if db is directly accessible or via internal mutation
        if ((ctx as any).db) {
          await (ctx as any).db.patch(args.parserId, {
            status,
            updatedAt: now,
          });

          if (args.versionId) {
            await (ctx as any).db.patch(args.versionId, {
              verifiedAt: result.valid ? now : undefined,
              verificationLog: log,
            });
          }
        }
      } catch (dbErr) {
        console.warn("Could not patch parser status directly from action:", dbErr);
      }
    }

    if (result.valid) {
      return {
        valid: true,
        status: "verified" as const,
        runtimeMs: result.runtimeMs,
        transactionCount: result.transactionCount,
        summary: result.summary,
        errors: [],
        reasons: [],
      };
    } else {
      return {
        valid: false,
        status: "rejected" as const,
        runtimeMs: result.runtimeMs,
        errors: result.errors,
        reasons: result.reasons,
      };
    }
  },
});

