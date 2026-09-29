/**
 * DocumentCanvas Component
 * 
 * Interactive statement visualizer combining HTML5 Canvas rendering
 * with an interactive SVG annotation surface synchronized in the 0..1000 coordinate space.
 */

import React, { useRef, useEffect, useState, useMemo } from "react";
import { StatementParserConfig, PdfColumn } from "../../../../../packages/dsl/schema.js";
import { NormalizedTextSpan } from "../../../../../packages/dsl/types.js";
import { StudioDocument, VisualColumn, CanvasZoomLevel } from "../types.js";
import { CanvasToolbar } from "./CanvasToolbar.js";
import { DraggableGuide } from "./DraggableGuide.js";
import { PageBoundsGuide } from "./PageBoundsGuide.js";

interface DocumentCanvasProps {
  document: StudioDocument;
  config: StatementParserConfig;
  selectedColumnId: string | null;
  hoveredColumnId: string | null;
  onSelectColumn: (colId: string | null) => void;
  onHoverColumn: (colId: string | null) => void;
  onUpdateColumnBounds: (colId: string, xStart: number, xEnd: number) => void;
  onUpdatePageBounds: (topMargin: number, bottomMargin: number) => void;
  onPageChange: (newPage: number) => void;
}

const COLUMN_COLORS = [
  "#10b981", // Emerald (Date)
  "#38bdf8", // Sky (Description)
  "#a855f7", // Purple (Ref / Branch)
  "#f59e0b", // Amber (Debit / Amount)
  "#ec4899", // Pink (Credit)
  "#06b6d4", // Cyan (Balance)
  "#84cc16", // Lime
  "#f97316", // Orange
];

export const DocumentCanvas: React.FC<DocumentCanvasProps> = ({
  document,
  config,
  selectedColumnId,
  hoveredColumnId,
  onSelectColumn,
  onHoverColumn,
  onUpdateColumnBounds,
  onUpdatePageBounds,
  onPageChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [zoom, setZoom] = useState<CanvasZoomLevel>("100%");
  const [showGuides, setShowGuides] = useState(true);
  const [showSpans, setShowSpans] = useState(true);
  const [showCutoffs, setShowCutoffs] = useState(true);

  // Map config columns to VisualColumn with assigned colors
  const visualColumns: VisualColumn[] = useMemo(() => {
    if (!Array.isArray(config.columns)) return [];
    return config.columns.map((c: any, idx: number) => {
      return {
        id: c.id,
        name: c.name || c.id,
        xStart: c.xStart ?? 0,
        xEnd: c.xEnd ?? 1000,
        color: COLUMN_COLORS[idx % COLUMN_COLORS.length]!,
        columnIndex: c.columnIndex,
      };
    });
  }, [config.columns]);

  // Current page text spans
  const spans = useMemo(() => {
    return document.spansByPage[document.currentPage] || [];
  }, [document.spansByPage, document.currentPage]);

  // Render text spans onto the HTML5 Canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || document.fileType !== "pdf") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use high-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const width = 1000;
    const height = 1000;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    ctx.scale(dpr, dpr);

    // Canvas background
    ctx.fillStyle = "#0c1017";
    ctx.fillRect(0, 0, width, height);

    // Subtle coordinate grid background
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 100; x < 1000; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1000);
      ctx.stroke();
    }
    for (let y = 100; y < 1000; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1000, y);
      ctx.stroke();
    }

    // Render text spans onto canvas
    for (const span of spans) {
      const isHeaderFooter =
        span.y < config.pageBounds.topMargin || span.y > config.pageBounds.bottomMargin;

      ctx.fillStyle = isHeaderFooter ? "#475569" : "#e2e8f0";
      ctx.font = `${Math.max(10, span.height)}px JetBrains Mono, monospace`;
      ctx.textBaseline = "top";
      ctx.fillText(span.text, span.x, span.y);
    }
  }, [spans, config.pageBounds, document.fileType]);

  // Determine zoom scale
  const zoomScale = useMemo(() => {
    switch (zoom) {
      case "50%": return 0.5;
      case "75%": return 0.75;
      case "100%": return 1;
      case "125%": return 1.25;
      case "150%": return 1.5;
      case "fit": return 1;
      default: return 1;
    }
  }, [zoom]);

  // Helper to test if a span is in a column
  const getSpanColumnColor = (span: NormalizedTextSpan): string | null => {
    const spanMidX = span.x + span.width / 2;
    for (const col of visualColumns) {
      const inBounds =
        (span.x >= col.xStart - 2 && span.x <= col.xEnd + 2) ||
        (spanMidX >= col.xStart && spanMidX <= col.xEnd);
      if (inBounds) return col.color;
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-none overflow-hidden relative">
      {/* Top Toolbar */}
      <CanvasToolbar
        currentPage={document.currentPage}
        totalPages={document.totalPages}
        zoom={zoom}
        showGuides={showGuides}
        showSpans={showSpans}
        showCutoffs={showCutoffs}
        onPageChange={onPageChange}
        onZoomChange={setZoom}
        onToggleGuides={() => setShowGuides(!showGuides)}
        onToggleSpans={() => setShowSpans(!showSpans)}
        onToggleCutoffs={() => setShowCutoffs(!showCutoffs)}
      />

      {/* Main Canvas Scroll Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex items-start justify-center bg-black/40 scifi-grid-bg"
      >
        {document.fileType === "pdf" ? (
          <div
            className="relative shadow-2xl border border-border/80 transition-all duration-200"
            style={{
              width: zoom === "fit" ? "100%" : `${Math.round(800 * zoomScale)}px`,
              aspectRatio: "1 / 1",
              maxWidth: "1100px",
              minWidth: "400px",
            }}
          >
            {/* HTML5 Canvas Layer (Rasterized text & background) */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Interactive SVG Annotation Surface (0..1000 Normalized Space) */}
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
            >
              {/* Text Spans Highlight Layer */}
              {showSpans && (
                <g className="text-spans-layer">
                  {spans.map((span, sIdx) => {
                    const colColor = getSpanColumnColor(span);
                    const isHovered =
                      hoveredColumnId !== null &&
                      visualColumns.some(
                        (c) =>
                          c.id === hoveredColumnId &&
                          ((span.x >= c.xStart - 2 && span.x <= c.xEnd + 2) ||
                            (span.x + span.width / 2 >= c.xStart && span.x + span.width / 2 <= c.xEnd))
                      );

                    return (
                      <rect
                        key={sIdx}
                        x={span.x}
                        y={span.y}
                        width={Math.max(4, span.width)}
                        height={Math.max(10, span.height)}
                        fill={isHovered ? `${colColor || "#38bdf8"}33` : "transparent"}
                        stroke={isHovered ? (colColor || "#38bdf8") : (colColor ? `${colColor}44` : "transparent")}
                        strokeWidth={isHovered ? 1.5 : 1}
                        className="transition-colors duration-100"
                      />
                    );
                  })}
                </g>
              )}

              {/* Page Bounds Cutoffs Layer */}
              {showCutoffs && (
                <PageBoundsGuide
                  topMargin={config.pageBounds.topMargin}
                  bottomMargin={config.pageBounds.bottomMargin}
                  headerPattern={config.pageBounds.headerPattern}
                  footerPattern={config.pageBounds.footerPattern}
                  onTopMarginChange={(top) =>
                    onUpdatePageBounds(top, config.pageBounds.bottomMargin)
                  }
                  onBottomMarginChange={(bottom) =>
                    onUpdatePageBounds(config.pageBounds.topMargin, bottom)
                  }
                />
              )}

              {/* Column Boundary Guides Layer */}
              {showGuides && (
                <g className="columns-guide-layer">
                  {visualColumns.map((col) => (
                    <DraggableGuide
                      key={col.id}
                      column={col}
                      isSelected={selectedColumnId === col.id}
                      isHovered={hoveredColumnId === col.id}
                      topCutoff={config.pageBounds.topMargin}
                      bottomCutoff={config.pageBounds.bottomMargin}
                      onSelect={onSelectColumn}
                      onHover={onHoverColumn}
                      onBoundsChange={onUpdateColumnBounds}
                    />
                  ))}
                </g>
              )}
            </svg>
          </div>
        ) : (
          /* CSV Tabular Data Grid View */
          <div className="w-full bg-card border border-border p-4 overflow-x-auto">
            <div className="text-xs font-mono text-muted-foreground mb-3 flex items-center justify-between">
              <span>CSV TABULAR PREVIEW — DELIMITER AUTO-DETECTED</span>
              <span>TOTAL ROWS: {document.csvRows?.length || 0}</span>
            </div>
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="p-2 text-left text-muted-foreground w-12">#</th>
                  {visualColumns.map((col) => (
                    <th
                      key={col.id}
                      onClick={() => onSelectColumn(col.id)}
                      className={`p-2 text-left cursor-pointer transition-colors ${
                        selectedColumnId === col.id ? "bg-primary/20 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: col.color }}
                        />
                        <span>{col.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          [Col {col.columnIndex ?? "?"}]
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {document.csvRows?.slice(1, 15).map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-2 text-muted-foreground">{rIdx + 1}</td>
                    {visualColumns.map((col) => {
                      const val = col.columnIndex !== undefined ? row[col.columnIndex] : "";
                      return (
                        <td key={col.id} className="p-2 truncate max-w-[200px]">
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Coordinate & Guide Status Footer */}
      <div className="px-3 py-1.5 border-t border-border bg-card/60 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <div>
          ACTIVE COLUMNS: <strong className="text-foreground">{visualColumns.length}</strong> | BOUNDS: [TOP: {config.pageBounds.topMargin}, BOTTOM: {config.pageBounds.bottomMargin}]
        </div>
        <div>
          COORDINATE GRID: <span className="text-emerald-400">0..1000 INT NORMALIZED</span>
        </div>
      </div>
    </div>
  );
};
