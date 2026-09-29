/**
 * RowContinuationForm Component
 * 
 * Form controls for multi-line description continuation assembly
 * and static ReDoS regex validation.
 */

import React, { useState } from "react";
import { Input, Switch, Card, CardHeader, CardTitle, CardContent } from "@boredkevin/ui";
import { RowContinuation } from "../../../../../packages/dsl/schema.js";
import { assertSafeRegex, ReDoSValidationError } from "../../../../../packages/dsl/redos.js";
import { ShieldCheck, AlertTriangle } from "lucide-react";

interface RowContinuationFormProps {
  rowContinuation: RowContinuation;
  onChange: (rc: RowContinuation) => void;
}

export const RowContinuationForm: React.FC<RowContinuationFormProps> = ({
  rowContinuation,
  onChange,
}) => {
  const [redosError, setRedosError] = useState<string | null>(null);

  const handleRegexChange = (pattern: string) => {
    try {
      assertSafeRegex(pattern);
      setRedosError(null);
    } catch (err: any) {
      if (err instanceof ReDoSValidationError) {
        setRedosError("ReDoS vulnerability detected: Nested quantifiers forbidden.");
      } else {
        setRedosError(err?.message || "Invalid regular expression");
      }
    }

    onChange({
      ...rowContinuation,
      dateRegex: pattern,
    });
  };

  return (
    <Card className="border-border bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-wider uppercase text-foreground">
          Row Continuation & Multi-line Assembly
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Required Switch */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-mono font-semibold text-foreground">
              Date Anchor Required
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">
              When enabled, lines lacking a valid date anchor are merged into the preceding transaction description.
            </div>
          </div>
          <Switch
            checked={rowContinuation.dateRequired}
            onCheckedChange={(checked) =>
              onChange({
                ...rowContinuation,
                dateRequired: checked,
              })
            }
          />
        </div>

        {/* Date Anchor Regex */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-muted-foreground block">
              Date Anchor Regex Pattern
            </label>
            <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              ReDoS Watchdog Active
            </div>
          </div>
          <Input
            value={rowContinuation.dateRegex}
            onChange={(e) => handleRegexChange(e.target.value)}
            placeholder="^\\d{2}/\\d{2}$"
            className={`h-8 font-mono text-xs ${redosError ? "border-destructive text-destructive" : ""}`}
          />
          {redosError && (
            <div className="flex items-center gap-1 text-[11px] font-mono text-destructive mt-1">
              <AlertTriangle className="h-3 w-3" />
              {redosError}
            </div>
          )}
        </div>

        {/* Description Joiner */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <label className="text-xs font-mono text-muted-foreground block">
            Description Line Joiner
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...rowContinuation,
                  descriptionJoiner: "\n",
                })
              }
              className={`p-2 text-xs font-mono border text-left transition-colors ${
                rowContinuation.descriptionJoiner === "\n"
                  ? "bg-primary/20 border-primary text-primary font-bold"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <div>Newline (\n)</div>
              <div className="text-[10px] text-muted-foreground">Preserves multi-line block text</div>
            </button>

            <button
              type="button"
              onClick={() =>
                onChange({
                  ...rowContinuation,
                  descriptionJoiner: " ",
                })
              }
              className={`p-2 text-xs font-mono border text-left transition-colors ${
                rowContinuation.descriptionJoiner === " "
                  ? "bg-primary/20 border-primary text-primary font-bold"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <div>Space (" ")</div>
              <div className="text-[10px] text-muted-foreground">Flattens lines into a single sentence</div>
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
