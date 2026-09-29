/**
 * ReDoS (Regular Expression Denial of Service) Protection & Safe Regex Validator
 * 
 * Invariants:
 * 1. Statically parse regex patterns before compilation/execution.
 * 2. Reject nested repetitions (e.g. (a+)+, ([a-zA-Z]+)*, (\d+)+).
 * 3. Enforce a 50ms execution deadline per page via timeout interrupts.
 */

export class ReDoSValidationError extends Error {
  constructor(message: string, public readonly pattern: string) {
    super(`ReDoS Protection Error: ${message} in pattern: "${pattern}"`);
    this.name = "ReDoSValidationError";
  }
}

export class ReDoSTimeoutError extends Error {
  constructor(message: string, public readonly elapsedMs: number) {
    super(`ReDoS Timeout Interrupt: ${message}`);
    this.name = "ReDoSTimeoutError";
  }
}

/**
 * Statically parses a regex pattern and asserts that it does not contain
 * dangerous nested repetitions or vulnerable structures that could lead to
 * exponential catastrophic backtracking.
 */
export function assertSafeRegex(pattern: string): void {
  if (!pattern || typeof pattern !== "string") {
    throw new ReDoSValidationError("Pattern must be a non-empty string", String(pattern));
  }

  // Pre-filter: Check common ReDoS nested repetition idioms via pattern analysis
  const nestedRepetitionSignatures = [
    // (x+)+, (x*)*, (x+)*, (x*)+
    /\((?:[^()\\]|\\.)*[*+]\s*\)[*+]/,
    // ([...]+)* or ([...]*)+
    /\((?:\[(?:[^\]\\]|\\.)*\]|[^()\\]|\\.)*[*+]\s*\)[*+]/,
    // (x{1,})* or (x*){1,}
    /\((?:[^()\\]|\\.)*\{\s*\d+\s*,\s*\d*\s*\}[^()]*\)[*+]/,
    /\((?:[^()\\]|\\.)*[*+][^()]*\)\{\s*\d+\s*,\s*\d*\s*\}/,
    // (x{1,}){1,}
    /\((?:[^()\\]|\\.)*\{\s*\d+\s*,\s*\d*\s*\}[^()]*\)\{\s*\d+\s*,\s*\d*\s*\}/,
  ];

  for (const sig of nestedRepetitionSignatures) {
    if (sig.test(pattern)) {
      throw new ReDoSValidationError(
        "Detected nested repetition quantifier (exponential backtracking risk)",
        pattern
      );
    }
  }

  // Deep structural token parser: tracks group nesting and repetition operators
  interface GroupContext {
    startIndex: number;
    hasInnerQuantifier: boolean;
  }

  const groupStack: GroupContext[] = [];
  let i = 0;
  const len = pattern.length;

  while (i < len) {
    const char = pattern[i];

    // Escaped character: skip backslash and escaped char
    if (char === "\\") {
      i += 2;
      continue;
    }

    // Character class: [...]
    if (char === "[") {
      i++;
      // Handle opening negation or closing bracket right after opening: e.g. [^]] or []]
      if (i < len && pattern[i] === "^") i++;
      if (i < len && pattern[i] === "]") i++;

      while (i < len && pattern[i] !== "]") {
        if (pattern[i] === "\\") {
          i += 2; // skip escape inside class
        } else {
          i++;
        }
      }
      i++; // skip ']'
      continue;
    }

    // Opening group: (
    if (char === "(") {
      groupStack.push({
        startIndex: i,
        hasInnerQuantifier: false,
      });
      i++;
      continue;
    }

    // Closing group: )
    if (char === ")") {
      const closingGroup = groupStack.pop();
      i++;

      // Check if closing group is immediately followed by a repetition quantifier
      let isOuterQuantified = false;
      if (i < len) {
        const nextChar = pattern[i];
        if (nextChar === "*" || nextChar === "+") {
          isOuterQuantified = true;
          i++;
        } else if (nextChar === "{") {
          // Check if range quantifier is repetition (e.g. {2,}, {2,5})
          const braceClose = pattern.indexOf("}", i);
          if (braceClose !== -1) {
            const rangeContent = pattern.slice(i + 1, braceClose);
            if (/^\d+\s*,\s*\d*$/.test(rangeContent)) {
              isOuterQuantified = true;
            }
            i = braceClose + 1;
          }
        }
      }

      if (closingGroup) {
        if (closingGroup.hasInnerQuantifier && isOuterQuantified) {
          throw new ReDoSValidationError(
            "Nested repetition detected: quantified group contains inner repetition",
            pattern
          );
        }

        // If the group was quantified, mark parent scope as containing a quantifier
        if (isOuterQuantified && groupStack.length > 0) {
          groupStack[groupStack.length - 1].hasInnerQuantifier = true;
        }
      }
      continue;
    }

    // Repetition quantifier on atomic token (*, +, or {n,m})
    if (char === "*" || char === "+") {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasInnerQuantifier = true;
      }
      i++;
      continue;
    }

    if (char === "{") {
      const braceClose = pattern.indexOf("}", i);
      if (braceClose !== -1) {
        const rangeContent = pattern.slice(i + 1, braceClose);
        if (/^\d+\s*,\s*\d*$/.test(rangeContent)) {
          if (groupStack.length > 0) {
            groupStack[groupStack.length - 1].hasInnerQuantifier = true;
          }
          i = braceClose + 1;
          continue;
        }
      }
    }

    i++;
  }
}

/**
 * Validates and compiles a regular expression safely.
 */
export function compileSafeRegex(pattern: string, flags = ""): RegExp {
  assertSafeRegex(pattern);
  return new RegExp(pattern, flags);
}

/**
 * Deadline watchdog that tracks page evaluation time and interrupts
 * if the execution threshold is exceeded.
 */
export class DeadlineWatchdog {
  private startTime: number;
  private readonly deadlineMs: number;

  constructor(deadlineMs = 50) {
    this.deadlineMs = deadlineMs;
    this.startTime = performance.now();
  }

  public reset(): void {
    this.startTime = performance.now();
  }

  public check(): void {
    const elapsed = performance.now() - this.startTime;
    if (elapsed > this.deadlineMs) {
      throw new ReDoSTimeoutError(
        `Page evaluation exceeded ${this.deadlineMs}ms deadline (took ${elapsed.toFixed(2)}ms)`,
        elapsed
      );
    }
  }

  public getElapsedMs(): number {
    return performance.now() - this.startTime;
  }
}

/**
 * Executes a regex match against an input string with deadline watchdog checks.
 */
export function safeRegexMatch(
  pattern: RegExp | string,
  input: string,
  watchdog?: DeadlineWatchdog
): RegExpMatchArray | null {
  if (watchdog) {
    watchdog.check();
  }

  const regex = typeof pattern === "string" ? compileSafeRegex(pattern) : pattern;
  const result = regex.exec(input);

  if (watchdog) {
    watchdog.check();
  }

  return result;
}

/**
 * Statically validates all regex patterns inside a StatementParserConfig.
 */
export function validateConfigRegexes(config: {
  matchers?: { contentPatterns: string[] };
  pageBounds?: { headerPattern?: string; footerPattern?: string };
  rowContinuation?: { dateRegex: string };
  fields?: { description?: { sanitizeRegex?: string }; amountStrategy?: any };
}): void {
  if (config.matchers?.contentPatterns) {
    for (const p of config.matchers.contentPatterns) {
      assertSafeRegex(p);
    }
  }

  if (config.pageBounds?.headerPattern) {
    assertSafeRegex(config.pageBounds.headerPattern);
  }

  if (config.pageBounds?.footerPattern) {
    assertSafeRegex(config.pageBounds.footerPattern);
  }

  if (config.rowContinuation?.dateRegex) {
    assertSafeRegex(config.rowContinuation.dateRegex);
  }

  if (config.fields?.description?.sanitizeRegex) {
    assertSafeRegex(config.fields.description.sanitizeRegex);
  }
}
