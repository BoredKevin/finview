/**
 * Dashboard KPI Metric Cards
 * 
 * Displays Net Worth, Inflow, Outflow, and Savings Rates over selectable ranges
 * with multi-currency breakdown and sci-fi HUD telemetry styling.
 */

import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
} from "@boredkevin/ui";
import {
  TrendingUp,
  TrendingDown,
  Percent,
  Wallet,
  Coins,
  ShieldCheck,
} from "lucide-react";
import { FinancialMetrics } from "../analytics/analyticsEngine.js";
import { formatMinorUnits } from "../utils/currency.js";
import { DateRange } from "../utils/date.js";

interface MetricCardsProps {
  metrics: FinancialMetrics | null;
  selectedRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  isLoading?: boolean;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  metrics,
  selectedRange,
  onRangeChange,
  isLoading = false,
}) => {
  const primaryCurrency = metrics?.primaryCurrency || "IDR";
  const primaryNetWorth = metrics?.netWorthByCurrency[primaryCurrency] ?? 0n;

  const inflow = metrics?.inflowMinorUnits ?? 0n;
  const outflow = metrics?.outflowMinorUnits ?? 0n;
  const savingsRate = metrics?.savingsRatePercentage ?? 0;

  const ranges: DateRange[] = ["30D", "90D", "1Y", "ALL"];

  return (
    <div className="space-y-3">
      {/* Date Range Selector Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Analysis Window:
          </span>
          <div className="flex items-center bg-muted/40 p-0.5 rounded border border-border">
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  selectedRange === r
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1"
        >
          <ShieldCheck className="h-3 w-3" />
          INTEGER PRECISION (BIGINT)
        </Badge>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Worth */}
        <Card telemetry="NET.01" className="bg-card/70 backdrop-blur-md border-border">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Total Net Worth
              </span>
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-xl font-mono font-bold text-foreground mt-1">
              {formatMinorUnits(primaryNetWorth, primaryCurrency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            {metrics && metrics.currencyBreakdown.length > 1 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {metrics.currencyBreakdown.map((cb) => (
                  <Badge
                    key={cb.currency}
                    variant="outline"
                    className="font-mono text-[9px] py-0 px-1 text-muted-foreground"
                  >
                    {cb.currency}: {formatMinorUnits(cb.totalMinorUnits, cb.currency)}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                Consolidated liquid balances
              </span>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Inflow */}
        <Card telemetry="INFLOW.02" className="bg-card/70 backdrop-blur-md border-border">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Total Inflow ({selectedRange})
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
            <CardTitle className="text-xl font-mono font-bold text-emerald-400 mt-1">
              +{formatMinorUnits(inflow, primaryCurrency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <span className="font-mono text-[11px] text-muted-foreground">
              Credits, payroll, and receipts
            </span>
          </CardContent>
        </Card>

        {/* Card 3: Outflow */}
        <Card telemetry="OUTFLOW.03" className="bg-card/70 backdrop-blur-md border-border">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Total Outflow ({selectedRange})
              </span>
              <TrendingDown className="h-4 w-4 text-rose-400" />
            </div>
            <CardTitle className="text-xl font-mono font-bold text-rose-400 mt-1">
              -{formatMinorUnits(outflow, primaryCurrency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <span className="font-mono text-[11px] text-muted-foreground">
              Expenses, bills, and withdrawals
            </span>
          </CardContent>
        </Card>

        {/* Card 4: Savings Rate */}
        <Card telemetry="SAVINGS.04" className="bg-card/70 backdrop-blur-md border-border">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Savings Rate
              </span>
              <Percent className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-xl font-mono font-bold text-foreground mt-1 flex items-center gap-2">
              <span>{savingsRate.toFixed(1)}%</span>
              <Badge
                variant={
                  savingsRate >= 20
                    ? "success"
                    : savingsRate > 0
                    ? "warning"
                    : "destructive"
                }
                className="font-mono text-[10px] py-0 px-1.5"
              >
                {savingsRate >= 20 ? "OPTIMAL" : savingsRate > 0 ? "STABLE" : "DEFICIT"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <span className="font-mono text-[11px] text-muted-foreground">
              Net retained surplus ratio
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
