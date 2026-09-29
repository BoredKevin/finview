/**
 * CanvasToolbar Component
 * 
 * Zoom controls, page navigation, layer toggles, and zero-retention invariant indicators.
 */

import React from "react";
import { Button } from "@boredkevin/ui";
import { Badge } from "@boredkevin/ui";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Eye,
  Layers,
} from "lucide-react";
import { CanvasZoomLevel } from "../types.js";

interface CanvasToolbarProps {
  currentPage: number;
  totalPages: number;
  zoom: CanvasZoomLevel;
  showGuides: boolean;
  showSpans: boolean;
  showCutoffs: boolean;
  onPageChange: (newPage: number) => void;
  onZoomChange: (zoom: CanvasZoomLevel) => void;
  onToggleGuides: () => void;
  onToggleSpans: () => void;
  onToggleCutoffs: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  currentPage,
  totalPages,
  zoom,
  showGuides,
  showSpans,
  showCutoffs,
  onPageChange,
  onZoomChange,
  onToggleGuides,
  onToggleSpans,
  onToggleCutoffs,
}) => {
  const zoomLevels: CanvasZoomLevel[] = ["50%", "75%", "100%", "125%", "150%"];

  const handleZoomIn = () => {
    if (zoom === "fit") {
      onZoomChange("100%");
      return;
    }
    const idx = zoomLevels.indexOf(zoom);
    if (idx < zoomLevels.length - 1) {
      onZoomChange(zoomLevels[idx + 1]!);
    }
  };

  const handleZoomOut = () => {
    if (zoom === "fit") {
      onZoomChange("75%");
      return;
    }
    const idx = zoomLevels.indexOf(zoom);
    if (idx > 0) {
      onZoomChange(zoomLevels[idx - 1]!);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2 border-b border-border bg-card/60 backdrop-blur-md">
      {/* Left: Page Navigation */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous Page"
          className="h-7 px-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-mono text-xs text-muted-foreground px-2">
          PAGE <strong className="text-foreground">{currentPage}</strong> / {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next Page"
          className="h-7 px-2"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Center: Zoom and Toggles */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomOut}
          aria-label="Zoom Out"
          className="h-7 w-7 p-0"
        >
          <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <span className="font-mono text-xs text-foreground min-w-[3.5rem] text-center">
          {zoom === "fit" ? "FIT" : zoom}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomIn}
          aria-label="Zoom In"
          className="h-7 w-7 p-0"
        >
          <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button
          variant={zoom === "fit" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onZoomChange(zoom === "fit" ? "100%" : "fit")}
          aria-label="Fit to Width"
          className="h-7 px-2 text-xs font-mono"
        >
          <Maximize2 className="h-3 w-3 mr-1" />
          FIT
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        {/* View toggles */}
        <Button
          variant={showGuides ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggleGuides}
          className="h-7 px-2 text-xs font-mono"
          title="Toggle Column Guides"
        >
          <Layers className="h-3 w-3 mr-1" />
          GUIDES
        </Button>

        <Button
          variant={showSpans ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggleSpans}
          className="h-7 px-2 text-xs font-mono"
          title="Toggle Text Span Highlights"
        >
          <Eye className="h-3 w-3 mr-1" />
          SPANS
        </Button>
      </div>

      {/* Right: Zero-Retention Security Invariant Badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1 py-0.5">
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          ZERO-RETENTION ACTIVE
        </Badge>
      </div>
    </div>
  );
};
