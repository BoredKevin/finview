/**
 * PageBoundsGuide Component
 * 
 * Interactive SVG horizontal margin cutoffs for table headers and footers.
 * Synchronized with the 0..1000 normalized coordinate space.
 */

import React, { useState } from "react";

interface PageBoundsGuideProps {
  topMargin: number;
  bottomMargin: number;
  headerPattern?: string;
  footerPattern?: string;
  onTopMarginChange: (val: number) => void;
  onBottomMarginChange: (val: number) => void;
}

export const PageBoundsGuide: React.FC<PageBoundsGuideProps> = ({
  topMargin,
  bottomMargin,
  headerPattern,
  footerPattern,
  onTopMarginChange,
  onBottomMarginChange,
}) => {
  const [dragging, setDragging] = useState<"top" | "bottom" | null>(null);
  const [dragStartY, setDragStartY] = useState(0);
  const [initialY, setInitialY] = useState(0);

  const handlePointerDown = (
    e: React.PointerEvent<SVGElement>,
    target: "top" | "bottom"
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(target);
    setDragStartY(e.clientY);
    setInitialY(target === "top" ? topMargin : bottomMargin);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (!dragging) return;
    e.stopPropagation();

    const svgElem = (e.currentTarget as unknown as SVGGraphicsElement).ownerSVGElement;
    if (!svgElem) return;
    const rect = svgElem.getBoundingClientRect();
    const scaleFactor = 1000 / rect.height;
    const deltaY = (e.clientY - dragStartY) * scaleFactor;

    if (dragging === "top") {
      const nextTop = Math.max(0, Math.min(bottomMargin - 20, Math.round(initialY + deltaY)));
      onTopMarginChange(nextTop);
    } else if (dragging === "bottom") {
      const nextBottom = Math.max(topMargin + 20, Math.min(1000, Math.round(initialY + deltaY)));
      onBottomMarginChange(nextBottom);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGElement>) => {
    if (!dragging) return;
    e.stopPropagation();
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setDragging(null);
  };

  return (
    <g
      className="page-bounds-guides select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <defs>
        {/* Striped pattern for cutoff zones */}
        <pattern id="cutoffStripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="20" stroke="#ef4444" strokeWidth="2" strokeOpacity="0.12" />
        </pattern>
      </defs>

      {/* Shaded Header Cutoff Zone (0 to topMargin) */}
      <rect
        x={0}
        y={0}
        width={1000}
        height={Math.max(0, topMargin)}
        fill="url(#cutoffStripes)"
        stroke="#ef4444"
        strokeOpacity={0.2}
        strokeWidth={1}
      />
      <g transform={`translate(15, ${Math.max(10, topMargin - 22)})`}>
        <rect x={0} y={0} width={180} height={18} rx={2} fill="#1c1917" stroke="#ef4444" strokeWidth={1} />
        <text x={8} y={13} fontSize={9} fill="#f87171" fontFamily="monospace" fontWeight="bold">
          HEADER CUTOFF (y &lt; {topMargin})
        </text>
      </g>

      {/* Top Margin Horizontal Guide Line */}
      <line
        x1={0}
        y1={topMargin}
        x2={1000}
        y2={topMargin}
        stroke="#ef4444"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {/* Top Margin Drag Handle */}
      <g
        transform={`translate(450, ${topMargin - 10})`}
        className="cursor-ns-resize"
        onPointerDown={(e) => handlePointerDown(e, "top")}
      >
        <rect
          x={0}
          y={0}
          width={100}
          height={20}
          rx={4}
          fill="#ef4444"
          opacity={0.9}
        />
        <text
          x={50}
          y={14}
          textAnchor="middle"
          fontSize={10}
          fill="#ffffff"
          fontFamily="monospace"
          fontWeight="bold"
          pointerEvents="none"
        >
          ▲ Top Cutoff ▼
        </text>
      </g>

      {/* Shaded Footer Cutoff Zone (bottomMargin to 1000) */}
      <rect
        x={0}
        y={bottomMargin}
        width={1000}
        height={Math.max(0, 1000 - bottomMargin)}
        fill="url(#cutoffStripes)"
        stroke="#ef4444"
        strokeOpacity={0.2}
        strokeWidth={1}
      />
      <g transform={`translate(15, ${Math.min(975, bottomMargin + 8)})`}>
        <rect x={0} y={0} width={180} height={18} rx={2} fill="#1c1917" stroke="#ef4444" strokeWidth={1} />
        <text x={8} y={13} fontSize={9} fill="#f87171" fontFamily="monospace" fontWeight="bold">
          FOOTER CUTOFF (y &gt; {bottomMargin})
        </text>
      </g>

      {/* Bottom Margin Horizontal Guide Line */}
      <line
        x1={0}
        y1={bottomMargin}
        x2={1000}
        y2={bottomMargin}
        stroke="#ef4444"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {/* Bottom Margin Drag Handle */}
      <g
        transform={`translate(450, ${bottomMargin - 10})`}
        className="cursor-ns-resize"
        onPointerDown={(e) => handlePointerDown(e, "bottom")}
      >
        <rect
          x={0}
          y={0}
          width={100}
          height={20}
          rx={4}
          fill="#ef4444"
          opacity={0.9}
        />
        <text
          x={50}
          y={14}
          textAnchor="middle"
          fontSize={10}
          fill="#ffffff"
          fontFamily="monospace"
          fontWeight="bold"
          pointerEvents="none"
        >
          ▲ Bottom Cutoff ▼
        </text>
      </g>
    </g>
  );
};
