/**
 * Accounts List & Balance Portfolio Component
 * 
 * Manages multi-currency financial accounts persisted locally in Dexie IndexedDB.
 */

import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
} from "@boredkevin/ui";
import {
  Wallet,
  Plus,
  Building2,
  Check,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Account } from "../../db/types.js";
import { AppDB } from "../../db/database.js";
import { createAccount } from "../../db/crud.js";
import { formatMinorUnits, parseCurrencyStringToMinorUnits } from "../utils/currency.js";

interface AccountsListProps {
  db: AppDB;
  accounts: Account[];
  activeAccountId?: string;
  onSelectAccount?: (accountId: string | undefined) => void;
}

export const AccountsList: React.FC<AccountsListProps> = ({
  db,
  accounts,
  activeAccountId,
  onSelectAccount,
}) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountCurrency, setNewAccountCurrency] = useState("IDR");
  const [newAccountInitialBalance, setNewAccountInitialBalance] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim()) return;

    setIsSubmitting(true);
    try {
      const balanceMinorUnits = parseCurrencyStringToMinorUnits(
        newAccountInitialBalance,
        newAccountCurrency
      );

      const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await createAccount(db, {
        id,
        name: newAccountName.trim(),
        currency: newAccountCurrency.toUpperCase(),
        balanceMinorUnits,
      });

      setNewAccountName("");
      setNewAccountInitialBalance("0");
      setCreateDialogOpen(false);
    } catch (err) {
      console.error("Failed to create account:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card telemetry="ACC.06" className="bg-card/70 backdrop-blur-md border-border h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
              Connected Accounts
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="h-7 px-2 font-mono text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </Button>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Locally encrypted vaults in Dexie IndexedDB.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-2 pt-0 overflow-y-auto max-h-[300px]">
        {/* All Accounts / Consolidated Filter */}
        <button
          type="button"
          onClick={() => onSelectAccount && onSelectAccount(undefined)}
          className={`w-full p-2.5 rounded border transition-colors flex items-center justify-between text-left font-mono text-xs ${
            !activeAccountId
              ? "bg-primary/15 border-primary text-foreground shadow-sm"
              : "bg-background/40 border-border/70 hover:border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-foreground">All Accounts (Consolidated)</span>
          </div>
          {!activeAccountId && <Check className="h-3.5 w-3.5 text-primary" />}
        </button>

        {accounts.length === 0 ? (
          <div className="p-4 text-center font-mono text-xs text-muted-foreground border border-dashed border-border rounded">
            No accounts created yet. Click "Add Account" to get started.
          </div>
        ) : (
          accounts.map((acc) => {
            const isSelected = activeAccountId === acc.id;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => onSelectAccount && onSelectAccount(acc.id)}
                className={`w-full p-2.5 rounded border transition-colors flex items-center justify-between text-left font-mono text-xs ${
                  isSelected
                    ? "bg-primary/15 border-primary text-foreground shadow-sm"
                    : "bg-background/40 border-border/70 hover:border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div>
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    {acc.name}
                    <Badge variant="outline" className="font-mono text-[9px] py-0 px-1">
                      {acc.currency}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    ID: {acc.id.slice(0, 12)}...
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-foreground">
                    {formatMinorUnits(acc.balanceMinorUnits, acc.currency)}
                  </div>
                  {isSelected && (
                    <div className="text-[10px] text-primary flex items-center justify-end gap-0.5">
                      Active Vault <ChevronRight className="h-3 w-3" />
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </CardContent>

      {/* Add Account Modal */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-md border-border">
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-mono text-[10px] gap-1">
                  <Building2 className="h-3 w-3" />
                  NEW VAULT
                </Badge>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  LOCAL ONLY
                </Badge>
              </div>
              <DialogTitle className="text-base font-mono tracking-tight text-foreground flex items-center gap-2 mt-2">
                Create Financial Account
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set up a local tracking vault for bank accounts, cards, or digital wallets.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 font-mono text-xs">
              <div className="space-y-1">
                <label htmlFor="account-name-input" className="text-muted-foreground">
                  Account Name
                </label>
                <Input
                  id="account-name-input"
                  placeholder="e.g. BCA Tahapan, Mandiri Payroll"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="account-currency-select" className="text-muted-foreground">
                    Currency
                  </label>
                  <select
                    id="account-currency-select"
                    value={newAccountCurrency}
                    onChange={(e) => setNewAccountCurrency(e.target.value)}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="IDR">IDR (Rp)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="SGD">SGD (S$)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="account-balance-input" className="text-muted-foreground">
                    Initial Balance
                  </label>
                  <Input
                    id="account-balance-input"
                    placeholder="0"
                    value={newAccountInitialBalance}
                    onChange={(e) => setNewAccountInitialBalance(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
                className="font-mono text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="cyber"
                size="sm"
                disabled={isSubmitting || !newAccountName.trim()}
                className="font-mono text-xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                {isSubmitting ? "Creating..." : "Save Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
