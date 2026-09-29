/**
 * DebitCreditRuleBuilder Component
 * 
 * Visual configuration interface for single-column sign markers (e.g. BCA's trailing "DB")
 * and split-column assignments, with real-time numeric evaluation preview.
 */

import React, { useState } from "react";
import { Button, Input, Badge, Card, CardHeader, CardTitle, CardContent } from "@boredkevin/ui";
import {
  AmountStrategy,
  SingleColumnAmountStrategy,
  SplitColumnAmountStrategy,
} from "../../../../../packages/dsl/schema.js";
import {
  parseSingleColumnAmount,
  parseSplitColumnAmount,
} from "../../../../../packages/dsl/engine.js";
import { VisualColumn } from "../types.js";
import { formatMinorUnits } from "../reconciliation/ReconciliationEngine.js";

interface DebitCreditRuleBuilderProps {
  columns: VisualColumn[];
  strategy: AmountStrategy;
  onChange: (strategy: AmountStrategy) => void;
}

export const DebitCreditRuleBuilder: React.FC<DebitCreditRuleBuilderProps> = ({
  columns,
  strategy,
  onChange,
}) => {
  const isSingle = "columnId" in strategy;

  // Test sandbox input
  const [testAmountStr, setTestAmountStr] = useState(
    isSingle ? "1.500.000,00 DB" : "2.000.000,00"
  );
  const [testCreditStr, setTestCreditStr] = useState("");

  const handleSwitchMode = (mode: "single" | "split") => {
    if (mode === "single") {
      const firstCol = columns[0]?.id || "amount";
      onChange({
        mode: "single",
        columnId: firstCol,
        debitIndicator: { pattern: "DB", position: "suffix" },
        decimalSep: ",",
        thousandSep: ".",
      });
      setTestAmountStr("1.500.000,00 DB");
    } else {
      const debitCol = columns[0]?.id || "debit";
      const creditCol = columns[1]?.id || "credit";
      onChange({
        mode: "split",
        debitColumnId: debitCol,
        creditColumnId: creditCol,
        decimalSep: ",",
        thousandSep: ".",
      });
      setTestAmountStr("2.000.000,00");
      setTestCreditStr("");
    }
  };

  // Compute test parsing preview
  let previewMinorUnits: bigint | null = null;
  let previewError: string | null = null;
  try {
    if (isSingle) {
      previewMinorUnits = parseSingleColumnAmount(
        testAmountStr,
        strategy as SingleColumnAmountStrategy
      );
    } else {
      previewMinorUnits = parseSplitColumnAmount(
        testAmountStr,
        testCreditStr,
        strategy as SplitColumnAmountStrategy
      );
    }
  } catch (err: any) {
    previewError = err?.message || "Invalid amount format";
  }

  return (
    <Card className="border-border bg-card/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono tracking-wider uppercase text-foreground">
            Debit / Credit Strategy Builder
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant={isSingle ? "cyber" : "outline"}
              size="sm"
              onClick={() => handleSwitchMode("single")}
              className="h-7 text-xs font-mono"
            >
              Single Column
            </Button>
            <Button
              variant={!isSingle ? "cyber" : "outline"}
              size="sm"
              onClick={() => handleSwitchMode("split")}
              className="h-7 text-xs font-mono"
            >
              Split Columns
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isSingle ? (
          /* Single Column Form */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Amount Column
                </label>
                <select
                  value={(strategy as SingleColumnAmountStrategy).columnId}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      columnId: e.target.value,
                    } as SingleColumnAmountStrategy)
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Debit Marker Position
                </label>
                <select
                  value={(strategy as SingleColumnAmountStrategy).debitIndicator.position}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      debitIndicator: {
                        ...(strategy as SingleColumnAmountStrategy).debitIndicator,
                        position: e.target.value as "prefix" | "suffix",
                      },
                    } as SingleColumnAmountStrategy)
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="suffix">Suffix (e.g. 1.000 DB)</option>
                  <option value="prefix">Prefix (e.g. -1.000, DR 1.000)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Debit Pattern
                </label>
                <Input
                  value={(strategy as SingleColumnAmountStrategy).debitIndicator.pattern}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      debitIndicator: {
                        ...(strategy as SingleColumnAmountStrategy).debitIndicator,
                        pattern: e.target.value,
                      },
                    } as SingleColumnAmountStrategy)
                  }
                  placeholder="DB, -, DR"
                  className="h-8 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Thousand Sep
                </label>
                <select
                  value={strategy.thousandSep}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      thousandSep: e.target.value as "." | ",",
                    })
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value=".">Dot (.) e.g. 1.500.000</option>
                  <option value=",">Comma (,) e.g. 1,500,000</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Decimal Sep
                </label>
                <select
                  value={strategy.decimalSep}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      decimalSep: e.target.value as "," | ".",
                    })
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value=",">Comma (,) e.g. 00,50</option>
                  <option value=".">Dot (.) e.g. 00.50</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          /* Split Column Form */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Debit (Outflow) Column
                </label>
                <select
                  value={(strategy as SplitColumnAmountStrategy).debitColumnId}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      debitColumnId: e.target.value,
                    } as SplitColumnAmountStrategy)
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Credit (Inflow) Column
                </label>
                <select
                  value={(strategy as SplitColumnAmountStrategy).creditColumnId}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      creditColumnId: e.target.value,
                    } as SplitColumnAmountStrategy)
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Thousand Sep
                </label>
                <select
                  value={strategy.thousandSep}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      thousandSep: e.target.value as "." | ",",
                    })
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value=".">Dot (.) e.g. 1.500.000</option>
                  <option value=",">Comma (,) e.g. 1,500,000</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Decimal Sep
                </label>
                <select
                  value={strategy.decimalSep}
                  onChange={(e) =>
                    onChange({
                      ...strategy,
                      decimalSep: e.target.value as "," | ".",
                    })
                  }
                  className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value=",">Comma (,) e.g. 00,50</option>
                  <option value=".">Dot (.) e.g. 00.50</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Sandbox Evaluation Preview */}
        <div className="mt-4 pt-3 border-t border-border/60 bg-muted/20 p-3">
          <div className="text-[11px] font-mono text-muted-foreground mb-2 flex items-center justify-between">
            <span>REAL-TIME ARITHMETIC PREVIEW</span>
            <Badge variant="outline" className="text-[10px] font-mono py-0">
              EXACT BIGINT
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 items-center">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground block">
                {isSingle ? "Test Amount String" : "Test Debit Input"}
              </label>
              <Input
                value={testAmountStr}
                onChange={(e) => setTestAmountStr(e.target.value)}
                className="h-7 font-mono text-xs"
                placeholder={isSingle ? "1.500.000,00 DB" : "2.000.000,00"}
              />
              {!isSingle && (
                <>
                  <label className="text-[10px] font-mono text-muted-foreground block mt-1">
                    Test Credit Input
                  </label>
                  <Input
                    value={testCreditStr}
                    onChange={(e) => setTestCreditStr(e.target.value)}
                    className="h-7 font-mono text-xs"
                    placeholder="Credit string or empty"
                  />
                </>
              )}
            </div>

            <div className="border border-border/80 bg-background/80 p-2.5 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground">
                Evaluated Minor Units:
              </div>
              {previewError ? (
                <div className="text-xs font-mono text-destructive">{previewError}</div>
              ) : (
                <>
                  <div className="text-sm font-mono font-bold text-foreground">
                    {previewMinorUnits !== null ? `${previewMinorUnits.toString()}n` : "0n"}
                  </div>
                  <div className="text-xs font-mono text-primary">
                    {previewMinorUnits !== null
                      ? formatMinorUnits(previewMinorUnits)
                      : "—"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
