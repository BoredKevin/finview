/**
 * DraggableGuide Component
 * 
 * Interactive SVG column boundary guide lines and column band.
 * Synchronized with the 0..1000 normalized coordinate space.
 * Supports dragging xStart / xEnd bounds and band translation with real-time text highlights.
 */

import React, { useState } from "react";
import { VisualColumn } from "../types.js";

interface DraggableGuideProps {
  column: VisualColumn;
  isSelected: boolean;
  isHovered: boolean;
  topCutoff: number;
  bottomCutoff: number;
  onSelect: (columnId: string) => void;
  onHover: (columnId: string | null) => void;
  onBoundsChange: (columnId: string, newStart: number, newEnd: number) => void;
}

export const DraggableGuide: React.FC<DraggableGuideProps> = ({
  column,
  isSelected,
  isHovered,
  topCutoff,
  bottomCutoff,
  onSelect,
  onHover,
  onBoundsChange,
}) => {
  const [dragMode, setDragMode] = useState<"start" | "end" | "move" | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [initialBounds, setInitialBounds] = useState<{ start: number; end: number }>({
    start: column.xStart,
    end: column.xEnd,
  });

  const width = Math.max(0, column.xEnd - column.xStart);
  const active = isSelected || isHovered;

  const handlePointerDown = (
    e: React.PointerEvent<SVGElement>,
    mode: "start" | "end" | "move"
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragMode(mode);
    setDragStartX(e.clientX);
    setInitialBounds({ start: column.xStart, end: column.xEnd });
    onSelect(column.id);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (!dragMode) return;
    e.stopPropagation();

    // Get SVG parent bounding rect to convert client delta to 0..1000 SVG units
    const svgElem = (e.currentTarget as unknown as SVGGraphicsElement).ownerSVGElement;
    if (!svgElem) return;
    const rect = svgElem.getBoundingClientRect();
    const scaleFactor = 1000 / rect.width;
    const deltaX = (e.clientX - dragStartX) * scaleFactor;

    if (dragMode === "start") {
      const nextStart = Math.max(0, Math.min(initialBounds.end - 10, Math.round(initialBounds.start + deltaX)));
      onBoundsChange(column.id, nextStart, initialBounds.end);
    } else if (dragMode === "end") {
      const nextEnd = Math.max(initialBounds.start + 10, Math.min(1000, Math.round(initialBounds.end + deltaX)));
      onBoundsChange(column.id, initialBounds.start, nextEnd);
    } else if (dragMode === "move") {
      const w = initialBounds.end - initialBounds.start;
      let nextStart = Math.round(initialBounds.start + deltaX);
      let nextEnd = nextStart + w;
      if (nextStart < 0) {
        nextStart = 0;
        nextEnd = w;
      }
      if (nextEnd > 1000) {
        nextEnd = 1000;
        nextStart = 1000 - w;
      }
      onBoundsChange(column.id, nextStart, nextEnd);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGElement>) => {
    if (!dragMode) return;
    e.stopPropagation();
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setDragMode(null);
  };

  const strokeColor = column.color;
  const fillColor = active ? `${column.color}22` : `${column.color}0a`;

  return (
    <g
      className="draggable-column-guide select-none cursor-pointer"
      onPointerEnter={() => onHover(column.id)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onSelect(column.id)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Column Band fill within active table range */}
      <rect
        x={column.xStart}
        y={topCutoff}
        width={width}
        height={Math.max(0, bottomCutoff - topCutoff)}
        fill={fillColor}
        stroke={active ? strokeColor : "transparent"}
        strokeWidth={1}
        strokeDasharray={active ? undefined : "4 4"}
        className="transition-colors duration-150"
      />

      {/* Center Drag Handle for Moving Entire Column */}
      <rect
        x={column.xStart + width / 2 - 15}
        y={topCutoff + 4}
        width={30}
        height={14}
        rx={3}
        fill={active ? strokeColor : "#1e293b"}
        opacity={0.85}
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => handlePointerDown(e, "move")}
      />
      <text
        x={column.xStart + width / 2}
        y={topCutoff + 14}
        textAnchor="middle"
        fontSize={8}
        fill="#ffffff"
        fontFamily="monospace"
        pointerEvents="none"
      >
        ↔
      </text>

      {/* Left Boundary Guide (xStart) */}
      <line
        x1={column.xStart}
        y1={0}
        x2={column.xStart}
        y2={1000}
        stroke={strokeColor}
        strokeWidth={active ? 2 : 1}
        strokeOpacity={active ? 1 : 0.6}
      />
      {/* Left Edge Drag Handle */}
      <rect
        x={column.xStart - 4}
        y={topCutoff + 25}
        width={8}
        height={40}
        rx={2}
        fill={strokeColor}
        opacity={active ? 1 : 0.7}
        className="cursor-ew-resize"
        onPointerDown={(e) => handlePointerDown(e, "start")}
      />

      {/* Right Boundary Guide (xEnd) */}
      <line
        x1={column.xEnd}
        y1={0}
        x2={column.xEnd}
        y2={1000}
        stroke={strokeColor}
        strokeWidth={active ? 2 : 1}
        strokeOpacity={active ? 1 : 0.6}
      />
      {/* Right Edge Drag Handle */}
      <rect
        x={column.xEnd - 4}
        y={topCutoff + 25}
        width={8}
        height={40}
        rx={2}
        fill={strokeColor}
        opacity={active ? 1 : 0.7}
        className="cursor-ew-resize"
        onPointerDown={(e) => handlePointerDown(e, "end")}
      />

      {/* Column Header Tag at Top */}
      <g transform={`translate(${column.xStart}, 6)`}>
        <rect
          x={0}
          y={0}
          width={Math.max(60, width)}
          height={20}
          rx={2}
          fill="#090d16"
          stroke={strokeColor}
          strokeWidth={active ? 1.5 : 1}
        />
        <text
          x={6}
          y={14}
          fontSize={10}
          fontWeight="bold"
          fill={strokeColor}
          fontFamily="monospace"
        >
          {column.name}
        </text>
        <text
          x={Math.max(60, width) - 6}
          y={14}
          fontSize={8}
          textAnchor="end"
          fill="#94a3b8"
          fontFamily="monospace"
        >
          [{column.xStart}-{column.xEnd}]
        </text>
      </g>
    </g>
  );
};
