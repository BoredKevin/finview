/**
 * ReconciliationView Component
 * 
 * Live-extracted ledger view and mathematical parity verification engine.
 * Displays:
 * OpeningBalance + Sum(Credits) - Sum(Debits) == ClosingBalance
 * and flags row-level errors, malformed dates, and missing balances.
 */

import React, { useState } from "react";
import { Badge, Input, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@boredkevin/ui";
import { ParsedTransaction, StatementParseResult } from "../../../../../packages/dsl/types.js";
import { MathematicalReconciliation } from "../types.js";
import { formatMinorUnits } from "./ReconciliationEngine.js";
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
} from "lucide-react";

interface ReconciliationViewProps {
  parseResult: StatementParseResult | null;
  reconciliation: MathematicalReconciliation | null;
  isParsing: boolean;
  parseError: string | null;
  executionTimeMs: number;
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({
  parseResult,
  reconciliation,
  isParsing,
  parseError,
  executionTimeMs,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const transactions = parseResult?.transactions || [];

  const filteredTransactions = transactions.filter((tx: ParsedTransaction) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      tx.description.toLowerCase().includes(term) ||
      tx.date.includes(term) ||
      tx.rawDate.includes(term) ||
      tx.hash.toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-md overflow-hidden">
      {/* Top Reconciliation Status HUD Banner */}
      <div className="p-3 border-b border-border bg-background/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">
              Mathematical Parity Verification
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isParsing ? (
              <Badge variant="outline" className="font-mono text-xs animate-pulse text-primary border-primary/50">
                <Clock className="h-3 w-3 mr-1 animate-spin" />
                RE-PARSING (150ms DEBOUNCED)...
              </Badge>
            ) : reconciliation ? (
              reconciliation.isBalanced ? (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 bg-emerald-500/10 font-mono text-xs gap-1 py-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  LEDGER BALANCED (DELTA: 0.00)
                </Badge>
              ) : (
                <Badge variant="destructive" className="font-mono text-xs gap-1 py-0.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  DISCREPANCY: {formatMinorUnits(reconciliation.discrepancyMinorUnits)}
                </Badge>
              )
            ) : null}

            {executionTimeMs > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {executionTimeMs}ms
              </span>
            )}
          </div>
        </div>

        {/* Mathematical Equation & Balance Metrics */}
        {reconciliation && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/60">
            {/* Opening Balance */}
            <div className="p-2 border border-border/60 bg-background/60">
              <div className="text-[10px] font-mono text-muted-foreground">Opening Balance</div>
              <div className="text-xs font-mono font-bold text-foreground truncate">
                {formatMinorUnits(reconciliation.openingBalanceMinorUnits)}
              </div>
            </div>

            {/* Total Credits */}
            <div className="p-2 border border-emerald-500/30 bg-emerald-500/5">
              <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <ArrowDownLeft className="h-3 w-3" />
                Credits ({reconciliation.creditCount})
              </div>
              <div className="text-xs font-mono font-bold text-emerald-400 truncate">
                +{formatMinorUnits(reconciliation.totalCreditsMinorUnits)}
              </div>
            </div>

            {/* Total Debits */}
            <div className="p-2 border border-amber-500/30 bg-amber-500/5">
              <div className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" />
                Debits ({reconciliation.debitCount})
              </div>
              <div className="text-xs font-mono font-bold text-amber-400 truncate">
                -{formatMinorUnits(reconciliation.totalDebitsMinorUnits)}
              </div>
            </div>

            {/* Closing Balance */}
            <div className="p-2 border border-border/60 bg-background/60">
              <div className="text-[10px] font-mono text-muted-foreground">Closing Balance</div>
              <div className="text-xs font-mono font-bold text-foreground truncate">
                {formatMinorUnits(reconciliation.closingBalanceMinorUnits)}
              </div>
            </div>
          </div>
        )}

        {/* Equation Formula Confirmation */}
        {reconciliation && (
          <div className="mt-2 text-[10px] font-mono text-muted-foreground">
            Proof: {formatMinorUnits(reconciliation.openingBalanceMinorUnits)} +{" "}
            {formatMinorUnits(reconciliation.totalCreditsMinorUnits)} -{" "}
            {formatMinorUnits(reconciliation.totalDebitsMinorUnits)} =={" "}
            <span className={reconciliation.isBalanced ? "text-emerald-400 font-bold" : "text-destructive font-bold"}>
              {formatMinorUnits(reconciliation.calculatedClosingBalanceMinorUnits)}
            </span>
          </div>
        )}
      </div>

      {/* Search and Table Toolbar */}
      <div className="p-2 border-b border-border bg-muted/20 flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search description, date, or hash..."
            className="pl-8 h-8 font-mono text-xs"
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          TRANSACTIONS: <strong className="text-foreground">{filteredTransactions.length}</strong> / {transactions.length}
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="flex-1 overflow-auto">
        {parseError ? (
          <div className="p-6 text-center text-destructive font-mono text-xs space-y-2">
            <AlertTriangle className="h-8 w-8 mx-auto" />
            <div className="font-bold">PARSING ERROR</div>
            <div>{parseError}</div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground font-mono text-xs">
            {isParsing ? "Extracting ledger rows..." : "No parsed transactions match current configuration."}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur-md">
              <TableRow className="border-border">
                <TableHead className="font-mono text-[11px] w-10 text-muted-foreground">#</TableHead>
                <TableHead className="font-mono text-[11px] w-24">Date</TableHead>
                <TableHead className="font-mono text-[11px]">Description</TableHead>
                <TableHead className="font-mono text-[11px] text-right w-28">Debit</TableHead>
                <TableHead className="font-mono text-[11px] text-right w-28">Credit</TableHead>
                <TableHead className="font-mono text-[11px] text-right w-32">Running Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((tx: ParsedTransaction) => {
                const isDebit = tx.amountMinorUnits < 0n;
                const isCredit = tx.amountMinorUnits > 0n;
                const hasContinuityError = reconciliation?.unbalancedRowIndices.includes(tx.sequenceIndex);
                const hasDateError = reconciliation?.malformedDateRowIndices.includes(tx.sequenceIndex);
                const hasMissingBalance = reconciliation?.missingBalanceRowIndices.includes(tx.sequenceIndex);

                return (
                  <TableRow
                    key={tx.id || tx.sequenceIndex}
                    className={`border-border/60 hover:bg-muted/30 font-mono text-xs ${
                      hasContinuityError ? "bg-destructive/10 border-destructive/40" : ""
                    }`}
                  >
                    <TableCell className="text-muted-foreground text-[10px]">
                      {tx.sequenceIndex + 1}
                    </TableCell>

                    {/* Date */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={hasDateError ? "text-destructive font-bold" : "text-foreground"}>
                          {tx.date}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {tx.rawDate}
                        </span>
                        {hasDateError && (
                          <span className="text-[9px] text-destructive">Malformed</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Description */}
                    <TableCell className="max-w-[260px]">
                      <div className="whitespace-pre-line text-foreground line-clamp-3">
                        {tx.description}
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate mt-0.5" title={tx.hash}>
                        Hash: {tx.hash.slice(0, 16)}…
                      </div>
                    </TableCell>

                    {/* Debit */}
                    <TableCell className="text-right font-medium text-amber-400">
                      {isDebit ? formatMinorUnits(-tx.amountMinorUnits) : "—"}
                    </TableCell>

                    {/* Credit */}
                    <TableCell className="text-right font-medium text-emerald-400">
                      {isCredit ? formatMinorUnits(tx.amountMinorUnits) : "—"}
                    </TableCell>

                    {/* Running Saldo */}
                    <TableCell className="text-right font-bold">
                      <div className="flex flex-col items-end">
                        <span className={hasContinuityError ? "text-destructive" : "text-foreground"}>
                          {formatMinorUnits(tx.runningBalanceMinorUnits)}
                        </span>
                        {hasContinuityError && (
                          <span className="text-[9px] text-destructive font-normal">
                            Continuity Error
                          </span>
                        )}
                        {hasMissingBalance && (
                          <span className="text-[9px] text-amber-400 font-normal">
                            Missing Balance
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};
