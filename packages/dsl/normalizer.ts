/**
 * Coordinate Normalization & Line Reconstruction Engine
 * 
 * Maps PDF character bounding boxes to a normalized 0..1000 integer grid
 * and clusters text spans into discrete, horizontal tabular rows.
 */

import { NormalizedTextSpan, ExtractedRow } from "./types.js";
import { PdfColumn } from "./schema.js";

export interface RawPdfTextItem {
  str: string;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, tx, ty]
  width?: number;
  height?: number;
}

/**
 * Normalizes a PDF bounding box from raw user space to a 0..1000 integer grid.
 * Invariants:
 * x_norm = round((x / pageWidth) * 1000)
 * y_norm = round(((pageHeight - y - height) / pageHeight) * 1000)
 */
export function normalizeCoordinates(
  x: number,
  y: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  const safePageW = pageWidth > 0 ? pageWidth : 1;
  const safePageH = pageHeight > 0 ? pageHeight : 1;

  const xNorm = Math.max(0, Math.min(1000, Math.round((x / safePageW) * 1000)));
  const yNorm = Math.max(0, Math.min(1000, Math.round(((safePageH - y - height) / safePageH) * 1000)));
  const wNorm = Math.max(0, Math.min(1000, Math.round((width / safePageW) * 1000)));
  const hNorm = Math.max(0, Math.min(1000, Math.round((height / safePageH) * 1000)));

  return { x: xNorm, y: yNorm, width: wNorm, height: hNorm };
}

/**
 * Extracts and normalizes text spans from PDF textContent items.
 */
export function extractNormalizedSpans(
  items: RawPdfTextItem[],
  pageWidth: number,
  pageHeight: number
): NormalizedTextSpan[] {
  const spans: NormalizedTextSpan[] = [];

  for (const item of items) {
    if (!item.str || typeof item.str !== "string") continue;
    const text = item.str;
    if (text.trim().length === 0) continue;

    // transform: [scaleX, skewY, skewX, scaleY, tx, ty]
    const tx = item.transform[4] ?? 0;
    const ty = item.transform[5] ?? 0;
    const width = item.width ?? Math.abs(item.transform[0] ?? 10);
    const height = item.height ?? Math.abs(item.transform[3] ?? 10);

    const norm = normalizeCoordinates(tx, ty, width, height, pageWidth, pageHeight);

    spans.push({
      text,
      x: norm.x,
      y: norm.y,
      width: norm.width,
      height: norm.height,
    });
  }

  return spans;
}

/**
 * Clusters extracted text spans into vertical rows using a tolerance threshold of Delta y <= 3.
 * Sorts row items by x_norm ascending.
 */
export function clusterSpansIntoRows(
  spans: NormalizedTextSpan[],
  toleranceDeltaY = 3
): ExtractedRow[] {
  if (spans.length === 0) return [];

  // Sort spans primarily by y ascending (top-to-bottom), then by x ascending (left-to-right)
  const sorted = [...spans].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  interface MutableRow {
    anchorY: number;
    minY: number;
    maxY: number;
    spans: NormalizedTextSpan[];
  }

  const mutableRows: MutableRow[] = [];

  for (const span of sorted) {
    // Find closest existing row within toleranceDeltaY
    let bestRow: MutableRow | null = null;
    let minDistance = Infinity;

    for (const row of mutableRows) {
      // Check distance against row's anchorY or span vertical bounds
      const dist = Math.abs(span.y - row.anchorY);
      if (dist <= toleranceDeltaY && dist < minDistance) {
        minDistance = dist;
        bestRow = row;
      }
    }

    if (bestRow) {
      bestRow.spans.push(span);
      bestRow.minY = Math.min(bestRow.minY, span.y);
      bestRow.maxY = Math.max(bestRow.maxY, span.y);
      // Recalculate anchor as weighted mean or midpoint
      bestRow.anchorY = Math.round((bestRow.minY + bestRow.maxY) / 2);
    } else {
      mutableRows.push({
        anchorY: span.y,
        minY: span.y,
        maxY: span.y,
        spans: [span],
      });
    }
  }

  // Sort each row's items by x_norm ascending, and finalize rows sorted by y ascending
  const rows: ExtractedRow[] = mutableRows.map((r) => {
    r.spans.sort((a, b) => a.x - b.x);
    const rawText = r.spans.map((s) => s.text.trim()).filter(Boolean).join(" ");
    return {
      y: r.anchorY,
      spans: r.spans,
      rawText,
    };
  });

  rows.sort((a, b) => a.y - b.y);
  return rows;
}

/**
 * Projects a clustered row of spans into defined tabular columns based on normalized xStart/xEnd bounds.
 */
export function projectRowToColumns(
  row: ExtractedRow,
  columns: PdfColumn[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const col of columns) {
    result[col.id] = "";
  }

  for (const span of row.spans) {
    const spanText = span.text.trim();
    if (!spanText) continue;

    // Determine matching column: span's start x or center x falls in [col.xStart, col.xEnd]
    const spanMidX = span.x + Math.round(span.width / 2);

    let matchedCol: PdfColumn | null = null;
    for (const col of columns) {
      // Allow a small boundary tolerance of 2 units
      const inBounds =
        (span.x >= col.xStart - 2 && span.x <= col.xEnd + 2) ||
        (spanMidX >= col.xStart && spanMidX <= col.xEnd);

      if (inBounds) {
        matchedCol = col;
        break;
      }
    }

    if (matchedCol) {
      const prev = result[matchedCol.id];
      result[matchedCol.id] = prev ? `${prev} ${spanText}` : spanText;
    }
  }

  return result;
}
