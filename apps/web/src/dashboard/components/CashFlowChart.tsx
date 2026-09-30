/**
 * Running Cash Flow Progression Chart Component
 * 
 * Hardware-accelerated SVG visualization tracking running cash flow progression,
 * cumulative balance curves, and daily net mutations over time.
 */

import React, { useState, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from "@boredkevin/ui";
import { Activity, TrendingUp } from "lucide-react";
import { CashFlowPoint } from "../analytics/analyticsEngine.js";
import { formatMinorUnits } from "../utils/currency.js";
import { formatDisplayDate } from "../utils/date.js";

interface CashFlowChartProps {
  points: CashFlowPoint[];
  currency?: string;
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  points,
  currency = "IDR",
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { minVal, maxVal, pathD, areaD, chartPoints } = useMemo(() => {
    if (points.length === 0) {
      return { minVal: 0n, maxVal: 0n, pathD: "", areaD: "", chartPoints: [] };
    }

    let min = points[0].cumulativeMinorUnits;
    let max = points[0].cumulativeMinorUnits;

    for (const p of points) {
      if (p.cumulativeMinorUnits < min) min = p.cumulativeMinorUnits;
      if (p.cumulativeMinorUnits > max) max = p.cumulativeMinorUnits;
    }

    // Add 10% breathing room to max/min
    const range = max - min || 1000n;
    const padding = range / 10n;
    const yMin = min - padding;
    const yMax = max + padding;
    const yRange = yMax - yMin || 1n;

    const width = 800;
    const height = 220;
    const paddingX = 40;
    const paddingY = 20;
    const plotWidth = width - paddingX * 2;
    const plotHeight = height - paddingY * 2;

    const coords = points.map((p, idx) => {
      const x =
        points.length === 1
          ? width / 2
          : paddingX + (idx / (points.length - 1)) * plotWidth;

      const normY = Number(p.cumulativeMinorUnits - yMin) / Number(yRange);
      const y = height - paddingY - normY * plotHeight;
      return { x, y, point: p };
    });

    if (coords.length === 1) {
      return {
        minVal: min,
        maxVal: max,
        pathD: `M ${coords[0].x - 50} ${coords[0].y} L ${coords[0].x + 50} ${coords[0].y}`,
        areaD: "",
        chartPoints: coords,
      };
    }

    let d = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      // Smooth curve with cubic bezier control points
      const prev = coords[i - 1];
      const curr = coords[i];
      const cp1x = prev.x + (curr.x - prev.x) / 2;
      const cp1y = prev.y;
      const cp2x = prev.x + (curr.x - prev.x) / 2;
      const cp2y = curr.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }

    const area = `${d} L ${coords[coords.length - 1].x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z`;

    return {
      minVal: min,
      maxVal: max,
      pathD: d,
      areaD: area,
      chartPoints: coords,
    };
  }, [points]);

  const activePoint = hoveredIndex !== null ? chartPoints[hoveredIndex] : null;

  return (
    <Card telemetry="FLOW.05" className="bg-card/70 backdrop-blur-md border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
              Running Cash Flow Progression
            </CardTitle>
          </div>
          {activePoint && (
            <div className="font-mono text-xs text-primary flex items-center gap-2">
              <span className="text-muted-foreground">{formatDisplayDate(activePoint.point.date)}:</span>
              <span className="font-bold">
                {formatMinorUnits(activePoint.point.cumulativeMinorUnits, currency)}
              </span>
            </div>
          )}
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Cumulative liquidity trajectory derived from reconciled statement transactions.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-2 pb-4">
        {points.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center font-mono text-xs text-muted-foreground border border-dashed border-border rounded">
            No transaction progression data in selected period.
          </div>
        ) : (
          <div className="relative w-full overflow-hidden">
            <svg
              viewBox="0 0 800 220"
              className="w-full h-auto max-h-[240px] overflow-visible"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                <linearGradient id="cashflow-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="40" y1="30" x2="760" y2="30" stroke="var(--border)" strokeDasharray="3 3" opacity="0.4" />
              <line x1="40" y1="100" x2="760" y2="100" stroke="var(--border)" strokeDasharray="3 3" opacity="0.4" />
              <line x1="40" y1="170" x2="760" y2="170" stroke="var(--border)" strokeDasharray="3 3" opacity="0.4" />

              {/* Gradient Area Fill */}
              {areaD && <path d={areaD} fill="url(#cashflow-gradient)" />}

              {/* Smooth Progression Line */}
              <path
                d={pathD}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="drop-shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]"
              />

              {/* Interactive Target Points */}
              {chartPoints.map((pt, idx) => (
                <g key={pt.point.date}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredIndex === idx ? 6 : 3}
                    fill={hoveredIndex === idx ? "var(--primary)" : "var(--background)"}
                    stroke="var(--primary)"
                    strokeWidth="2"
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredIndex(idx)}
                  />
                  {/* Invisible hit area */}
                  <rect
                    x={pt.x - 15}
                    y={0}
                    width={30}
                    height={220}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                  />
                </g>
              ))}

              {/* Active Crosshair */}
              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={20}
                  x2={activePoint.x}
                  y2={200}
                  stroke="var(--primary)"
                  strokeDasharray="2 2"
                  opacity="0.6"
                />
              )}
            </svg>

            {/* Hover Tooltip Box */}
            {activePoint && (
              <div
                className="absolute top-2 right-4 bg-background/90 backdrop-blur-md p-2.5 rounded border border-primary/40 font-mono text-[11px] shadow-lg pointer-events-none"
              >
                <div className="font-bold text-foreground">
                  {formatDisplayDate(activePoint.point.date)}
                </div>
                <div className="text-emerald-400 mt-0.5">
                  Inflow: +{formatMinorUnits(activePoint.point.inflowMinorUnits, currency)}
                </div>
                <div className="text-rose-400">
                  Outflow: -{formatMinorUnits(activePoint.point.outflowMinorUnits, currency)}
                </div>
                <div className="text-primary font-bold border-t border-border/60 pt-1 mt-1">
                  Balance: {formatMinorUnits(activePoint.point.cumulativeMinorUnits, currency)}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
