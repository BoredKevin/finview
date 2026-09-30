/**
 * Transaction Ledger Component
 * 
 * High-density local financial ledger displaying validated transactions
 * with search filtering, balance inspection, and soft-delete capabilities.
 */

import React, { useState, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Input,
  Badge,
  Button,
} from "@boredkevin/ui";
import {
  Search,
  Receipt,
  Trash2,
  Calendar,
  ShieldCheck,
  FileDown,
} from "lucide-react";
import { Transaction, Account } from "../../db/types.js";
import { AppDB } from "../../db/database.js";
import { softDeleteTransaction } from "../../db/crud.js";
import { formatMinorUnits } from "../utils/currency.js";
import { formatDisplayDate } from "../utils/date.js";

interface TransactionLedgerProps {
  db: AppDB;
  transactions: Transaction[];
  accounts: Account[];
  primaryCurrency?: string;
}

export const TransactionLedger: React.FC<TransactionLedgerProps> = ({
  db,
  transactions,
  accounts,
  primaryCurrency = "IDR",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>("all");

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    for (const acc of accounts) {
      map.set(acc.id, acc);
    }
    return map;
  }, [accounts]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.deletedAt !== null) return false;

      if (selectedAccountFilter !== "all" && tx.accountId !== selectedAccountFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = tx.description.toLowerCase().includes(q);
        const dateMatch = tx.date.includes(q);
        return descMatch || dateMatch;
      }

      return true;
    });
  }, [transactions, selectedAccountFilter, searchQuery]);

  const handleDelete = async (txId: string) => {
    if (confirm("Soft delete this transaction? It will be moved to tombstones.")) {
      try {
        await softDeleteTransaction(db, txId);
      } catch (err) {
        console.error("Failed to delete transaction:", err);
      }
    }
  };

  return (
    <Card telemetry="LEDGER.08" className="bg-card/70 backdrop-blur-md border-border overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
                Transaction Ledger ({filteredTransactions.length})
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Encrypted ledger transactions stored locally with deterministic SHA-256 deduplication.
            </CardDescription>
          </div>

          {/* Search & Account Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search narrative or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 font-mono text-xs bg-background/50"
              />
            </div>

            <select
              value={selectedAccountFilter}
              onChange={(e) => setSelectedAccountFilter(e.target.value)}
              className="bg-background border border-border rounded px-2 h-8 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 p-0">
        <div className="max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
              <TableRow className="border-border">
                <TableHead className="font-mono text-xs w-28">Date</TableHead>
                <TableHead className="font-mono text-xs w-32">Account</TableHead>
                <TableHead className="font-mono text-xs">Description</TableHead>
                <TableHead className="font-mono text-xs w-28">Category</TableHead>
                <TableHead className="font-mono text-xs text-right w-32">Amount</TableHead>
                <TableHead className="font-mono text-xs text-right w-32">Balance</TableHead>
                <TableHead className="font-mono text-xs text-center w-14">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 font-mono text-xs text-muted-foreground">
                    No transactions found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.slice(0, 150).map((tx) => {
                  const acc = accountMap.get(tx.accountId);
                  const curr = acc?.currency || primaryCurrency;
                  const amt = BigInt(tx.amountMinorUnits ?? 0n);
                  const isExpense = amt < 0n;

                  // Infer category token from description narrative
                  const upperDesc = tx.description.toUpperCase();
                  let catLabel = "General";
                  let catVariant: "default" | "secondary" | "outline" | "success" | "warning" = "outline";
                  if (/PAYROLL|GAJI|SALARY|INCOME|DIVIDEND/.test(upperDesc)) {
                    catLabel = "Payroll";
                    catVariant = "success";
                  } else if (/PLN|TELKOM|PBB|BPJS|LISTRIK|AIR|PULSA|UTILITIES/.test(upperDesc)) {
                    catLabel = "Utilities";
                    catVariant = "warning";
                  } else if (/SUBSCRIPTION|NETFLIX|SPOTIFY|APPLE|GOOGLE|AWS|OPENAI/.test(upperDesc)) {
                    catLabel = "Recurring";
                    catVariant = "secondary";
                  } else if (/RESTO|CAFE|FOOD|MCD|STARBUCKS|KFC|WARUNG|DINING/.test(upperDesc)) {
                    catLabel = "Dining";
                    catVariant = "outline";
                  } else if (/ATM|TARIK|SETOR|CASH/.test(upperDesc)) {
                    catLabel = "Cash / ATM";
                    catVariant = "outline";
                  } else if (/TRANSFER|BIF|BI-FAST|TRSF|LLG|RTGS/.test(upperDesc)) {
                    catLabel = "Transfer";
                    catVariant = "secondary";
                  } else if (/QRIS|EDC|MERCHANT|TOKO|SHOPEE|TOKOPEDIA/.test(upperDesc)) {
                    catLabel = "Merchant";
                    catVariant = "default";
                  }

                  return (
                    <TableRow key={tx.id} className="font-mono text-xs border-border/60 hover:bg-muted/10">
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDisplayDate(tx.date)}
                      </TableCell>

                      <TableCell className="truncate max-w-[120px] text-muted-foreground">
                        {acc?.name || "Unknown"}
                      </TableCell>

                      <TableCell className="font-medium text-foreground max-w-xs truncate">
                        <span title={tx.description}>{tx.description}</span>
                      </TableCell>

                      <TableCell>
                        <Badge variant={catVariant} className="font-mono text-[9px] py-0 px-1.5 uppercase">
                          {catLabel}
                        </Badge>
                      </TableCell>

                      {/* Signed colored amounts: Green credit, White/Muted debit */}
                      <TableCell
                        className={`text-right font-bold whitespace-nowrap ${
                          isExpense ? "text-foreground" : "text-emerald-400"
                        }`}
                      >
                        {isExpense ? "-" : "+"}
                        {formatMinorUnits(isExpense ? -amt : amt, curr)}
                      </TableCell>

                      <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                        {tx.runningBalanceMinorUnits !== undefined
                          ? formatMinorUnits(tx.runningBalanceMinorUnits, curr)
                          : "—"}
                      </TableCell>

                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(tx.id)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                          title="Soft Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
