/**
 * Statement Reconciliation & Atomic Commit Screen
 * 
 * Presents extracted transactions alongside deterministic confidence scores,
 * allows user inspection and selection, verifies mathematical parity,
 * and performs atomic transactional commit into Dexie IndexedDB.
 */

import React, { useState, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@boredkevin/ui";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  CheckSquare,
  Square,
  Database,
  ArrowRight,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Account } from "../../db/types.js";
import { ReconciliationItem } from "./types.js";
import { formatMinorUnits } from "../utils/currency.js";
import { formatDisplayDate } from "../utils/date.js";

interface ReconciliationScreenProps {
  items: ReconciliationItem[];
  accounts: Account[];
  defaultAccountId?: string;
  onCommit: (accountId: string, selectedItems: ReconciliationItem[]) => Promise<void>;
  onCancel: () => void;
  isCommitting?: boolean;
}

export const ReconciliationScreen: React.FC<ReconciliationScreenProps> = ({
  items: initialItems,
  accounts,
  defaultAccountId,
  onCommit,
  onCancel,
  isCommitting = false,
}) => {
  const [items, setItems] = useState<ReconciliationItem[]>(initialItems);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    defaultAccountId || (accounts.length > 0 ? accounts[0].id : "")
  );

  const selectedCount = items.filter((it) => it.selected).length;
  const allSelected = selectedCount === items.length && items.length > 0;

  // Toggle all items
  const handleToggleAll = () => {
    const nextState = !allSelected;
    setItems((prev) => prev.map((it) => ({ ...it, selected: nextState })));
  };

  // Toggle single item
  const handleToggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it))
    );
  };

  // Calculate totals for selected items
  const { totalInflows, totalOutflows, netMutation, highConfidenceCount, warningCount } =
    useMemo(() => {
      let inflows = 0n;
      let outflows = 0n;
      let highCount = 0;
      let warnCount = 0;

      for (const item of items) {
        if (!item.selected) continue;
        const amt = BigInt(item.transaction.amountMinorUnits ?? 0n);
        if (amt > 0n) inflows += amt;
        if (amt < 0n) outflows += -amt;

        if (item.confidence.level === "high") highCount++;
        if (item.confidence.level === "low" || item.confidence.warnings.length > 0) {
          warnCount++;
        }
      }

      return {
        totalInflows: inflows,
        totalOutflows: outflows,
        netMutation: inflows - outflows,
        highConfidenceCount: highCount,
        warningCount: warnCount,
      };
    }, [items]);

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);
  const currency = activeAccount?.currency || "IDR";

  const handleCommit = async () => {
    if (!selectedAccountId) return;
    const selected = items.filter((it) => it.selected);
    await onCommit(selectedAccountId, selected);
  };

  return (
    <div className="w-full space-y-4">
      {/* Header and KPI Bar */}
      <Card className="bg-card/80 backdrop-blur-md border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-mono text-[10px]">
                  EXTRACTION VERIFICATION
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1"
                >
                  <ShieldCheck className="h-3 w-3" />
                  PRE-COMMIT REVIEW
                </Badge>
              </div>
              <CardTitle className="text-lg font-mono font-bold tracking-tight text-foreground mt-1">
                Statement Reconciliation Ledger
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Review confidence ratings and verify transactions prior to atomic Dexie IndexedDB commit.
              </CardDescription>
            </div>

            {/* Target Account Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="target-account-select" className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                Target Account:
              </label>
              <select
                id="target-account-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="bg-background border border-border rounded px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
              >
                {accounts.length === 0 ? (
                  <option value="">No Accounts Available</option>
                ) : (
                  accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-background/50 p-3 rounded border border-border font-mono text-xs">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase block">Selected / Total</span>
              <span className="text-sm font-bold text-foreground">
                {selectedCount} <span className="text-xs font-normal text-muted-foreground">/ {items.length}</span>
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase block">Total Inflows</span>
              <span className="text-sm font-bold text-emerald-400">
                +{formatMinorUnits(totalInflows, currency)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase block">Total Outflows</span>
              <span className="text-sm font-bold text-rose-400">
                -{formatMinorUnits(totalOutflows, currency)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase block">Net Mutation</span>
              <span
                className={`text-sm font-bold ${
                  netMutation >= 0n ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {netMutation >= 0n ? "+" : ""}
                {formatMinorUnits(netMutation, currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extracted Transactions Table */}
      <Card className="bg-card/80 backdrop-blur-md border-border overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAll}
              className="text-muted-foreground hover:text-foreground p-1"
              title={allSelected ? "Deselect All" : "Select All"}
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
            <span className="text-xs font-mono text-muted-foreground">
              Select All Transactions
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {highConfidenceCount} High Confidence
            </span>
            {warningCount > 0 && (
              <span className="text-amber-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {warningCount} Warnings
              </span>
            )}
          </div>
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
              <TableRow className="border-border">
                <TableHead className="w-10"></TableHead>
                <TableHead className="font-mono text-xs w-28">Date</TableHead>
                <TableHead className="font-mono text-xs">Description</TableHead>
                <TableHead className="font-mono text-xs text-right w-36">Amount</TableHead>
                <TableHead className="font-mono text-xs text-right w-36">Balance</TableHead>
                <TableHead className="font-mono text-xs text-center w-28">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 font-mono text-xs text-muted-foreground">
                    No transactions extracted.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const amt = BigInt(item.transaction.amountMinorUnits ?? 0n);
                  const isExpense = amt < 0n;

                  return (
                    <TableRow
                      key={item.id}
                      className={`font-mono text-xs transition-colors border-border/60 ${
                        item.selected ? "bg-muted/10" : "opacity-50"
                      }`}
                    >
                      <TableCell className="w-10">
                        <button
                          type="button"
                          onClick={() => handleToggleItem(item.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {item.selected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {formatDisplayDate(item.transaction.date)}
                      </TableCell>

                      <TableCell className="font-medium text-foreground max-w-md truncate">
                        <div title={item.transaction.description}>
                          {item.transaction.description}
                        </div>
                        {item.confidence.warnings.length > 0 && (
                          <div className="text-[10px] text-amber-400/90 truncate">
                            {item.confidence.warnings.join(", ")}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className={`text-right font-bold ${isExpense ? "text-rose-400" : "text-emerald-400"}`}>
                        {isExpense ? "" : "+"}
                        {formatMinorUnits(amt, currency)}
                      </TableCell>

                      <TableCell className="text-right text-muted-foreground">
                        {item.transaction.runningBalanceMinorUnits !== undefined &&
                        item.transaction.runningBalanceMinorUnits !== null
                          ? formatMinorUnits(item.transaction.runningBalanceMinorUnits, currency)
                          : "—"}
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge
                          variant={
                            item.confidence.level === "high"
                              ? "success"
                              : item.confidence.level === "medium"
                              ? "warning"
                              : "destructive"
                          }
                          className="font-mono text-[10px] py-0 px-1.5"
                        >
                          {item.confidence.score}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t border-border bg-background/60">
          <div className="text-xs font-mono text-muted-foreground">
            {selectedCount} records selected for atomic Dexie commit
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isCommitting}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="cyber"
              size="sm"
              onClick={handleCommit}
              disabled={isCommitting || selectedCount === 0 || !selectedAccountId}
              className="font-mono text-xs gap-1.5"
            >
              <Database className="h-3.5 w-3.5" />
              {isCommitting ? "Committing..." : `Commit (${selectedCount}) to Dexie`}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};
