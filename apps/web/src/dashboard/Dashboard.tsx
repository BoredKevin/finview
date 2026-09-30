/**
 * Finview Cockpit & Unified Financial Dashboard
 * 
 * Unifies statement ingestion, reactive local-first analytics,
 * running cash flow progression, multi-account portfolio management,
 * recurring subscriptions radar, and seamless handoff to Marketplace & Studio.
 * 
 * System Invariants:
 * 1. Zero Data Egress: Unencrypted figures and raw banking records remain strictly client-side.
 * 2. UI Responsiveness: Local analytics calculations never block the main thread.
 */

import React, { useState, useMemo } from "react";
import { Button, Badge } from "@boredkevin/ui";
import { Sparkles, Database } from "lucide-react";

import { AppLayout } from "../components/layout/AppLayout.js";
import { getDatabase } from "../db/database.js";
import { createAccount, createTransaction } from "../db/crud.js";
import { StudioDocument } from "../studio/types.js";
import { ParserStudio } from "../studio/ParserStudio.js";
import { ParserMarketplace } from "../marketplace/ParserMarketplace.js";
import { DateRange } from "./utils/date.js";
import { useDashboardAnalytics } from "./analytics/useDashboardAnalytics.js";
import { MetricCards } from "./components/MetricCards.js";
import { CashFlowChart } from "./components/CashFlowChart.js";
import { AccountsList } from "./components/AccountsList.js";
import { RecurringList } from "./components/RecurringList.js";
import { TransactionLedger } from "./components/TransactionLedger.js";
import { IngestionDropzone } from "./ingest/IngestionDropzone.js";
import { TelemetryErrorBoundary } from "./telemetry/TelemetryErrorBoundary.js";

export type DashboardView = "dashboard" | "marketplace" | "studio";

interface DashboardProps {
  initialView?: DashboardView;
  workerClient?: any;
  convexClient?: any;
}

export const Dashboard: React.FC<DashboardProps> = ({
  initialView = "dashboard",
  workerClient,
  convexClient,
}) => {
  const db = useMemo(() => getDatabase(), []);

  const [activeView, setActiveView] = useState<DashboardView>(initialView);
  const [selectedRange, setSelectedRange] = useState<DateRange>("30D");
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [studioPreloadDoc, setStudioPreloadDoc] = useState<StudioDocument | undefined>(undefined);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  // Local-First Reactive Analytics Hook
  const {
    accounts,
    transactions,
    metrics,
    cashFlow,
    recurring,
    isLoading,
    delegatedToWorker,
    executionTimeMs,
    totalTransactionCount,
  } = useDashboardAnalytics(selectedRange, "IDR", selectedAccountId);

  // Handoff to Studio with preloaded document
  const handleOpenStudio = (doc?: StudioDocument) => {
    setStudioPreloadDoc(doc);
    setActiveView("studio");
  };

  // Seed sample demo accounts and transactions if empty
  const handleSeedDemoTreasury = async () => {
    setIsSeedingDemo(true);
    try {
      const now = Date.now();
      const bcaId = "acc_bca_checking";
      const cimbId = "acc_cimb_savings";

      await createAccount(db, {
        id: bcaId,
        name: "BCA Checking",
        currency: "IDR",
        balanceMinorUnits: 3450000000n, // Rp 34.500.000,00
      });

      await createAccount(db, {
        id: cimbId,
        name: "CIMB Niaga",
        currency: "IDR",
        balanceMinorUnits: 1825000000n, // Rp 18.250.000,00
      });

      const today = new Date();
      const formatDate = (offsetDays: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - offsetDays);
        return d.toISOString().split("T")[0]!;
      };

      const sampleTx = [
        {
          id: `tx_seed_1`,
          accountId: bcaId,
          date: formatDate(1),
          description: "TRANSFER DR PT TEKNOLOGI KARYA GAJI SEPTEMBER",
          amountMinorUnits: 2500000000n, // +Rp 25.000.000
          runningBalanceMinorUnits: 3450000000n,
          hash: "seed_hash_1",
          updatedAt: now,
          deletedAt: null,
        },
        {
          id: `tx_seed_2`,
          accountId: bcaId,
          date: formatDate(3),
          description: "SUBSCRIPTION NETFLIX JAKARTA ID",
          amountMinorUnits: -18600000n, // -Rp 186.000
          runningBalanceMinorUnits: 950000000n,
          hash: "seed_hash_2",
          updatedAt: now,
          deletedAt: null,
        },
        {
          id: `tx_seed_3`,
          accountId: bcaId,
          date: formatDate(5),
          description: "PAYMENT QRIS KOPI KENANGAN SENOPATI",
          amountMinorUnits: -4500000n, // -Rp 45.000
          runningBalanceMinorUnits: 968600000n,
          hash: "seed_hash_3",
          updatedAt: now,
          deletedAt: null,
        },
        {
          id: `tx_seed_4`,
          accountId: cimbId,
          date: formatDate(7),
          description: "PLN POSTPAID BILL PAYMENT TELKOM",
          amountMinorUnits: -85000000n, // -Rp 850.000
          runningBalanceMinorUnits: 1825000000n,
          hash: "seed_hash_4",
          updatedAt: now,
          deletedAt: null,
        },
        {
          id: `tx_seed_5`,
          accountId: bcaId,
          date: formatDate(12),
          description: "TRSF E-BANKING DB INVESTASI REKSADANA BIBIT",
          amountMinorUnits: -500000000n, // -Rp 5.000.000
          runningBalanceMinorUnits: 973100000n,
          hash: "seed_hash_5",
          updatedAt: now,
          deletedAt: null,
        },
        {
          id: `tx_seed_6`,
          accountId: bcaId,
          date: formatDate(18),
          description: "TRANSFER KE BIF ANGGRAINI NURSITA",
          amountMinorUnits: -125000000n, // -Rp 1.250.000
          runningBalanceMinorUnits: 1473100000n,
          hash: "seed_hash_6",
          updatedAt: now,
          deletedAt: null,
        },
      ];

      for (const t of sampleTx) {
        await createTransaction(db, t);
      }
    } catch (err) {
      console.error("Failed to seed demo treasury:", err);
    } finally {
      setIsSeedingDemo(false);
    }
  };

  return (
    <AppLayout
      activeTab={activeView}
      onTabChange={setActiveView}
      isStudioActive={activeView === "studio"}
      delegatedToWorker={delegatedToWorker}
    >
      <TelemetryErrorBoundary fallbackTitle="Runtime Component Error">
        {activeView === "studio" ? (
          <div className="h-full w-full">
            <ParserStudio
              initialDocument={studioPreloadDoc}
              onBack={() => {
                setStudioPreloadDoc(undefined);
                setActiveView("dashboard");
              }}
            />
          </div>
        ) : activeView === "marketplace" ? (
          <div className="max-w-7xl mx-auto p-4 sm:p-6 w-full">
            <ParserMarketplace
              onOpenStudioWithConfig={() => handleOpenStudio()}
            />
          </div>
        ) : (
          <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 w-full">
            {/* 1. Top Ingestion Bar */}
            <IngestionDropzone
              db={db}
              accounts={accounts}
              activeAccountId={selectedAccountId}
              onOpenStudio={handleOpenStudio}
              workerClient={workerClient}
              convexClient={convexClient}
            />

            {/* Quick Demo Seed Banner when vault is empty */}
            {accounts.length === 0 && (
              <div className="p-4 rounded-lg bg-card/70 border border-primary/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <Database className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold text-foreground">
                      Local Dexie Vault is currently empty
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      Drop an e-statement above, add an account, or populate sample treasury data.
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="cyber"
                  size="sm"
                  onClick={handleSeedDemoTreasury}
                  disabled={isSeedingDemo}
                  className="font-mono text-xs gap-1.5 h-8 shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isSeedingDemo ? "Seeding..." : "Load Demo Treasury (BCA & CIMB)"}
                </Button>
              </div>
            )}

            {/* 2. Metric Summary Grid (Top Row) */}
            <MetricCards
              metrics={metrics}
              selectedRange={selectedRange}
              onRangeChange={setSelectedRange}
              isLoading={isLoading}
            />

            {/* 3. Cash Flow Progression Chart (Middle Section) */}
            <CashFlowChart
              points={cashFlow}
              currency={metrics?.primaryCurrency || "IDR"}
            />

            {/* 4. Bottom Section: 2-Column Split (Accounts Breakdown & Recent Transactions Feed) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (lg:col-span-5): Accounts Breakdown & Recurring Subscriptions */}
              <div className="lg:col-span-5 space-y-6 flex flex-col">
                <AccountsList
                  db={db}
                  accounts={accounts}
                  activeAccountId={selectedAccountId}
                  onSelectAccount={setSelectedAccountId}
                />

                <RecurringList
                  patterns={recurring}
                  currency={metrics?.primaryCurrency || "IDR"}
                />
              </div>

              {/* Right Column (lg:col-span-7): Recent Transactions Feed */}
              <div className="lg:col-span-7 flex flex-col">
                <TransactionLedger
                  db={db}
                  transactions={transactions}
                  accounts={accounts}
                  primaryCurrency={metrics?.primaryCurrency || "IDR"}
                />
              </div>
            </div>
          </div>
        )}
      </TelemetryErrorBoundary>
    </AppLayout>
  );
};
