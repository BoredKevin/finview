/**
 * Recurring Transactions & Subscriptions Radar Component
 * 
 * Automatically detects and visualizes ongoing recurring payments, subscriptions,
 * and fixed recurring bills identified from the client ledger.
 */

import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from "@boredkevin/ui";
import {
  Repeat,
  Sparkles,
  Calendar,
  CreditCard,
  Flame,
} from "lucide-react";
import { RecurringPattern } from "../analytics/recurringEngine.js";
import { formatMinorUnits } from "../utils/currency.js";
import { formatDisplayDate } from "../utils/date.js";

interface RecurringListProps {
  patterns: RecurringPattern[];
  currency?: string;
}

export const RecurringList: React.FC<RecurringListProps> = ({
  patterns,
  currency = "IDR",
}) => {
  return (
    <Card telemetry="REC.07" className="bg-card/70 backdrop-blur-md border-border h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
              Subscriptions & Recurring Radar
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className="border-primary/40 text-primary bg-primary/10 font-mono text-[10px] gap-1"
          >
            <Sparkles className="h-3 w-3" />
            AUTO-DETECTED
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Algorithmic pattern clustering of predictable recurring obligations.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-2 pt-0 overflow-y-auto max-h-[300px]">
        {patterns.length === 0 ? (
          <div className="p-4 text-center font-mono text-xs text-muted-foreground border border-dashed border-border rounded">
            No recurring subscription patterns detected yet. Ingest statements to discover periodic bills.
          </div>
        ) : (
          patterns.map((pat) => {
            const isNegative = pat.averageAmountMinorUnits < 0n;
            const absAmt = isNegative ? -pat.averageAmountMinorUnits : pat.averageAmountMinorUnits;

            return (
              <div
                key={pat.id}
                className="p-2.5 rounded border border-border/80 bg-background/40 hover:bg-background/70 transition-colors flex items-center justify-between font-mono text-xs"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span className="truncate max-w-[160px] sm:max-w-[220px]" title={pat.merchantName}>
                      {pat.merchantName}
                    </span>
                    {pat.isSubscription && (
                      <Badge
                        variant="secondary"
                        className="bg-primary/20 text-primary border-primary/30 text-[9px] py-0 px-1"
                      >
                        SUBSCRIPTION
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[9px] py-0 px-1 text-muted-foreground uppercase">
                      {pat.frequency}
                    </Badge>
                  </div>

                  <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                    <span>{pat.occurrences} charges</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-primary/70" />
                      Next: {formatDisplayDate(pat.predictedNextDate)}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`font-bold ${isNegative ? "text-rose-400" : "text-emerald-400"}`}>
                    {isNegative ? "-" : "+"}
                    {formatMinorUnits(absAmt, currency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {pat.confidence}% match
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
