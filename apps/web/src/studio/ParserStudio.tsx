/**
 * ParserStudio Workspace
 * 
 * Interactive studio allowing users to visually create, test, and sanitize
 * declarative parser definitions directly against proprietary PDF/CSV bank statements
 * without code generation.
 * 
 * Invariants:
 * 1. Zero Local Retention: Uploaded raw statements remain in transient React state;
 *    never written to IndexedDB, caches, or external services.
 * 2. Sanitization Parity: Redaction pipelines alter text values while retaining
 *    character counts, bounding-box geometry, and balance integrity.
 */

import React, { useState, useRef, useMemo } from "react";
import {
  ThemeProvider,
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@boredkevin/ui";
import "@boredkevin/ui/theme.css";

import { StatementParserConfig, PdfColumn } from "../../../../packages/dsl/schema.js";
import { StudioDocument, VisualColumn } from "./types.js";
import { DocumentCanvas } from "./canvas/DocumentCanvas.js";
import { ConfigWizard } from "./wizard/ConfigWizard.js";
import { ReconciliationView } from "./reconciliation/ReconciliationView.js";
import { FixtureGenerator } from "./sanitizer/FixtureGenerator.js";
import { useDebouncedParse } from "./reconciliation/useDebouncedParse.js";
import {
  createDefaultSampleDocument,
  SAMPLE_DOCUMENTS,
  BCA_SAMPLE_CONFIG,
  CIMB_SAMPLE_CONFIG,
  BLU_SAMPLE_CONFIG,
} from "./samples/sampleStatements.js";

import {
  ShieldCheck,
  Upload,
  Trash2,
  FileText,
  Sliders,
  Table,
  Lock,
  Download,
  FolderOpen,
} from "lucide-react";

export const ParserStudio: React.FC = () => {
  // Ephemeral transient document state — INVARIANT 1: Zero Local Retention
  const [document, setDocument] = useState<StudioDocument>(createDefaultSampleDocument);
  const [config, setConfig] = useState<StatementParserConfig>(BCA_SAMPLE_CONFIG);

  // Active UI selection
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"wizard" | "ledger" | "sanitizer">("wizard");
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);

  // Hidden file input ref for statement uploads
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time debounced parsing execution (150ms debounce) via Web Worker
  const {
    result: parseResult,
    reconciliation,
    isParsing,
    error: parseError,
    executionTimeMs,
  } = useDebouncedParse(document, config, 150);

  // Visual columns mapped with assigned colors
  const visualColumns: VisualColumn[] = useMemo(() => {
    if (!Array.isArray(config.columns)) return [];
    const colors = ["#10b981", "#38bdf8", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4"];
    return config.columns.map((c: any, idx: number) => ({
      id: c.id,
      name: c.name || c.id,
      xStart: c.xStart ?? 0,
      xEnd: c.xEnd ?? 1000,
      color: colors[idx % colors.length]!,
      columnIndex: c.columnIndex,
    }));
  }, [config.columns]);

  // Extract sample dates from active page text spans or rows for preview
  const sampleDates = useMemo(() => {
    const dates: string[] = [];
    const currentSpans = document.spansByPage[document.currentPage] || [];
    const dateCol = visualColumns.find((c) => c.id === config.fields.date.columnId);

    if (dateCol) {
      for (const span of currentSpans) {
        if (span.y >= config.pageBounds.topMargin && span.y <= config.pageBounds.bottomMargin) {
          const inCol =
            (span.x >= dateCol.xStart - 2 && span.x <= dateCol.xEnd + 2) ||
            (span.x + span.width / 2 >= dateCol.xStart && span.x + span.width / 2 <= dateCol.xEnd);
          if (inCol && span.text.trim()) {
            dates.push(span.text.trim());
          }
        }
      }
    }

    if (document.csvRows && document.csvRows.length > 1) {
      for (const row of document.csvRows.slice(1, 6)) {
        if (row[0]) dates.push(row[0]);
      }
    }

    return dates.length > 0 ? dates : ["01/10", "05/10", "12/10", "20/10", "31/10"];
  }, [document, config, visualColumns]);

  // Handlers for interactive SVG guides
  const handleUpdateColumnBounds = (colId: string, xStart: number, xEnd: number) => {
    setConfig((prev) => ({
      ...prev,
      columns: (prev.columns as any[]).map((c) =>
        c.id === colId ? { ...c, xStart, xEnd } : c
      ),
    }));
  };

  const handleUpdatePageBounds = (topMargin: number, bottomMargin: number) => {
    setConfig((prev) => ({
      ...prev,
      pageBounds: {
        ...prev.pageBounds,
        topMargin,
        bottomMargin,
      },
    }));
  };

  // Switch statement sample
  const handleSelectSample = (sampleKey: "bca" | "cimb" | "blu") => {
    const loader = SAMPLE_DOCUMENTS[sampleKey];
    if (loader) {
      setDocument(loader());
      if (sampleKey === "bca") setConfig(BCA_SAMPLE_CONFIG);
      if (sampleKey === "cimb") setConfig(CIMB_SAMPLE_CONFIG);
      if (sampleKey === "blu") setConfig(BLU_SAMPLE_CONFIG);
    }
  };

  // File upload handler - transient memory retention only
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    const isCsv = file.name.toLowerCase().endsWith(".csv");

    if (isCsv) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.split(","));
      setDocument({
        id: `upload-${Date.now()}`,
        name: file.name,
        fileType: "csv",
        data: text,
        totalPages: 1,
        currentPage: 1,
        spansByPage: {},
        csvRows: lines,
        isSample: false,
        uploadedAt: Date.now(),
      });
      setConfig(BLU_SAMPLE_CONFIG);
    } else if (isPdf) {
      const buffer = await file.arrayBuffer();
      setDocument({
        id: `upload-${Date.now()}`,
        name: file.name,
        fileType: "pdf",
        data: new Uint8Array(buffer),
        totalPages: 1,
        currentPage: 1,
        spansByPage: {},
        isSample: false,
        uploadedAt: Date.now(),
      });
      setConfig(BCA_SAMPLE_CONFIG);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Purge document buffer completely from memory (Zero Local Retention)
  const handlePurgeDocument = () => {
    setDocument({
      id: "empty",
      name: "No statement loaded",
      fileType: "pdf",
      data: new Uint8Array(0),
      totalPages: 0,
      currentPage: 0,
      spansByPage: {},
      isSample: false,
      uploadedAt: 0,
    });
  };

  // Export current config JSON
  const handleExportConfigJson = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${config.meta.bankId}-parser-config.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden font-sans select-none">
        {/* Studio Top Navigation Bar */}
        <header className="h-12 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between z-20 shrink-0">
          {/* Brand & Statement Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-primary rounded-none rotate-45" />
              <span className="font-mono text-sm font-bold tracking-wider uppercase text-foreground">
                PARSER STUDIO
              </span>
            </div>
            <span className="text-muted-foreground text-xs font-mono">|</span>
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[260px]">
              {document.name}
            </span>
          </div>

          {/* Sample Switcher & Document Controls */}
          <div className="flex items-center gap-2">
            {/* Quick Samples */}
            <div className="hidden sm:flex items-center gap-1 bg-muted/30 p-1 border border-border/60">
              <span className="text-[10px] font-mono text-muted-foreground px-1">SAMPLES:</span>
              <button
                type="button"
                onClick={() => handleSelectSample("bca")}
                className={`px-2 py-0.5 text-[11px] font-mono transition-colors ${
                  config.meta.bankId === "bca"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                BCA (PDF)
              </button>
              <button
                type="button"
                onClick={() => handleSelectSample("cimb")}
                className={`px-2 py-0.5 text-[11px] font-mono transition-colors ${
                  config.meta.bankId === "cimb-niaga"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                CIMB (Split)
              </button>
              <button
                type="button"
                onClick={() => handleSelectSample("blu")}
                className={`px-2 py-0.5 text-[11px] font-mono transition-colors ${
                  config.meta.bankId === "blu-bca"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                BLU (CSV)
              </button>
            </div>

            {/* Upload Statement Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 font-mono text-xs gap-1"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload File
            </Button>

            {/* Export Config */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportConfigJson}
              title="Export DSL Configuration JSON"
              className="h-8 font-mono text-xs gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              DSL
            </Button>

            {/* Purge Buffer Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePurgeDocument}
              title="Purge raw document from memory"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            {/* Invariant 1 Badge */}
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1 py-0.5"
              title="All statements are retained in ephemeral RAM only. Never written to IndexedDB or external servers."
            >
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              ZERO RETENTION
            </Badge>
          </div>
        </header>

        {/* Main Split-Screen Workspace */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {/* Left Panel: Statement Visualizer & Interactive Canvas */}
          <div className="flex-1 h-full border-r border-border overflow-hidden flex flex-col">
            <DocumentCanvas
              document={document}
              config={config}
              selectedColumnId={selectedColumnId}
              hoveredColumnId={hoveredColumnId}
              onSelectColumn={setSelectedColumnId}
              onHoverColumn={setHoveredColumnId}
              onUpdateColumnBounds={handleUpdateColumnBounds}
              onUpdatePageBounds={handleUpdatePageBounds}
              onPageChange={(page) => setDocument((prev) => ({ ...prev, currentPage: page }))}
            />
          </div>

          {/* Right Panel: Tabbed Tooling & Reconciliation Workspace */}
          <div className="w-full md:w-[500px] lg:w-[580px] h-full flex flex-col bg-card/40 backdrop-blur-md overflow-hidden shrink-0">
            {/* Workspace Tabs Navigation */}
            <div className="p-2 border-b border-border bg-background/60">
              <div className="grid grid-cols-3 gap-1 bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveWorkspaceTab("wizard")}
                  className={`py-1.5 text-xs font-mono flex items-center justify-center gap-1.5 transition-colors ${
                    activeWorkspaceTab === "wizard"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  Wizard
                </button>

                <button
                  type="button"
                  onClick={() => setActiveWorkspaceTab("ledger")}
                  className={`py-1.5 text-xs font-mono flex items-center justify-center gap-1.5 transition-colors ${
                    activeWorkspaceTab === "ledger"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Table className="h-3.5 w-3.5" />
                  Ledger ({parseResult?.transactions.length || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveWorkspaceTab("sanitizer")}
                  className={`py-1.5 text-xs font-mono flex items-center justify-center gap-1.5 transition-colors ${
                    activeWorkspaceTab === "sanitizer"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Sanitizer & Fixture
                </button>
              </div>
            </div>

            {/* Active Workspace View Content */}
            <div className="flex-1 overflow-hidden">
              {activeWorkspaceTab === "wizard" && (
                <ConfigWizard
                  config={config}
                  visualColumns={visualColumns}
                  sampleDates={sampleDates}
                  selectedColumnId={selectedColumnId}
                  onSelectColumn={setSelectedColumnId}
                  onHoverColumn={setHoveredColumnId}
                  onChange={setConfig}
                />
              )}

              {activeWorkspaceTab === "ledger" && (
                <ReconciliationView
                  parseResult={parseResult}
                  reconciliation={reconciliation}
                  isParsing={isParsing}
                  parseError={parseError}
                  executionTimeMs={executionTimeMs}
                />
              )}

              {activeWorkspaceTab === "sanitizer" && (
                <FixtureGenerator
                  document={document}
                  config={config}
                  parseResult={parseResult}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default ParserStudio;
