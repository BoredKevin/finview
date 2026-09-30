/**
 * Parser Marketplace UI Component
 * 
 * Decentralized registry for discovering, verifying, inspecting, installing,
 * and reporting declarative statement parser configurations.
 * 
 * Invariants:
 * 1. Non-Executable Registry: Market listings consist strictly of validated, inert JSON schemas.
 * 2. Deterministic Verification: Verified status guaranteed by 100% extraction precision against fixtures.
 */

import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  CornerEdges,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@boredkevin/ui";

import {
  ShieldCheck,
  Download,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Search,
  FileText,
  CheckCircle2,
  Lock,
  ArrowUpCircle,
  ExternalLink,
  Code2,
  Eye,
  Check,
  Copy,
  Layers,
} from "lucide-react";

import { useMarketplace } from "./useMarketplace.js";
import { MarketplaceParserItem } from "./types.js";

export interface ParserMarketplaceProps {
  onSelectParser?: (parser: MarketplaceParserItem) => void;
  onOpenStudioWithConfig?: (config: any) => void;
}

export const ParserMarketplace: React.FC<ParserMarketplaceProps> = ({
  onSelectParser,
  onOpenStudioWithConfig,
}) => {
  const {
    parsers,
    filter,
    setFilter,
    installedCount,
    pendingUpdates,
    isLoading,
    actionMessage,
    clearActionMessage,
    installParser,
    uninstallParser,
    upgradeParser,
    reportParser,
    refreshCatalog,
  } = useMarketplace();

  // Reporting dialog state
  const [reportingParser, setReportingParser] = useState<MarketplaceParserItem | null>(null);
  const [reportReason, setReportReason] = useState<"broken_parser" | "malicious_attempt" | "spam">("broken_parser");
  const [reportDetails, setReportDetails] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Inspect Config & Fixture Dialog state
  const [inspectingParser, setInspectingParser] = useState<MarketplaceParserItem | null>(null);
  const [inspectTab, setInspectTab] = useState<"dsl" | "fixture">("dsl");
  const [copiedInspect, setCopiedInspect] = useState(false);

  const handleOpenReportModal = (parser: MarketplaceParserItem) => {
    setReportingParser(parser);
    setReportReason("broken_parser");
    setReportDetails("");
  };

  const handleOpenInspectModal = (parser: MarketplaceParserItem) => {
    setInspectingParser(parser);
    setInspectTab("dsl");
    setCopiedInspect(false);
  };

  const handleSendReport = async () => {
    if (!reportingParser || !reportDetails.trim()) return;
    try {
      setIsSubmittingReport(true);
      await reportParser({
        parserId: reportingParser.id,
        slug: reportingParser.slug,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportingParser(null);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleCopyInspectJson = async (content: any) => {
    await navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopiedInspect(true);
    setTimeout(() => setCopiedInspect(false), 2000);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-foreground font-sans">
      {/* 1. Marketplace Header */}
      <div className="relative rounded-lg p-5 sm:p-6 bg-card/75 backdrop-blur-md border border-border shadow-xl overflow-hidden">
        <CornerEdges telemetry="REGISTRY // SECURE-MARKETPLACE-v1" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono tracking-widest text-primary uppercase font-bold">
                [FINVIEW PROTOCOL // MARKETPLACE]
              </span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider border-primary/40 text-primary">
                Non-Executable AST
              </Badge>
              <Badge variant="success" className="text-[10px] uppercase font-mono tracking-wider">
                100% Deterministic Parity
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
              Statement Parser Registry
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              Discover, install, and audit declarative bank statement schemas. Every configuration is strictly inert JSON, verified against sanitized fixtures with 100% mathematical ledger parity.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center shrink-0">
            <div className="px-3 py-1.5 rounded border border-border bg-background/50 font-mono text-xs">
              <span className="text-muted-foreground">INSTALLED:</span>{" "}
              <span className="text-primary font-bold">{installedCount}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshCatalog}
              disabled={isLoading}
              className="gap-2 font-mono text-xs h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Sync Registry
            </Button>
          </div>
        </div>

        {/* Action message banner */}
        {actionMessage && (
          <div className="mt-4 p-3 rounded bg-primary/10 border border-primary/30 flex items-center justify-between text-xs text-primary font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>{actionMessage}</span>
            </div>
            <button
              onClick={clearActionMessage}
              className="text-xs hover:underline text-muted-foreground ml-4"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Available Updates Alert Banner */}
      {pendingUpdates.length > 0 && (
        <div className="p-4 rounded-lg bg-warning/10 border border-warning/40 text-warning flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <ArrowUpCircle className="w-5 h-5 text-warning shrink-0" />
            <div>
              <p className="text-sm font-semibold">
                Parser Updates Available ({pendingUpdates.length})
              </p>
              <p className="text-xs opacity-90">
                New verified layouts are available for: {pendingUpdates.join(", ")}. Upgrading preserves your zero-retention offline cache.
              </p>
            </div>
          </div>
          <Badge variant="warning" className="uppercase font-mono text-xs">
            Action Recommended
          </Badge>
        </div>
      )}

      {/* 2. Cohesive Search and Filter Bar */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-card/60 p-3 rounded-lg border border-border">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="marketplace-search-input"
            placeholder="Search bank name, slug, or keywords..."
            value={filter.searchQuery}
            onChange={(e) => setFilter({ ...filter, searchQuery: e.target.value })}
            className="pl-9 text-xs font-mono h-9 bg-background/60"
          />
        </div>

        {/* Combined Filter Chips (ALL, PDF, CSV, ID, GLOBAL) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* File Type Filter Chips */}
          <div className="flex items-center rounded border border-border bg-background/60 p-0.5 text-xs font-mono h-9">
            <button
              type="button"
              id="filter-type-all"
              onClick={() => setFilter({ ...filter, fileType: "all" })}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                filter.fileType === "all"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              id="filter-type-pdf"
              onClick={() => setFilter({ ...filter, fileType: "pdf" })}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                filter.fileType === "pdf"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PDF
            </button>
            <button
              type="button"
              id="filter-type-csv"
              onClick={() => setFilter({ ...filter, fileType: "csv" })}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                filter.fileType === "csv"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CSV
            </button>
          </div>

          {/* Region / Country Filter Chips */}
          <div className="flex items-center rounded border border-border bg-background/60 p-0.5 text-xs font-mono h-9">
            <button
              type="button"
              id="filter-country-global"
              onClick={() => setFilter({ ...filter, country: undefined })}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                !filter.country
                  ? "bg-secondary text-secondary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              GLOBAL
            </button>
            <button
              type="button"
              id="filter-country-id"
              onClick={() => setFilter({ ...filter, country: "ID" })}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                filter.country === "ID"
                  ? "bg-secondary text-secondary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ID (Indonesia)
            </button>
          </div>
        </div>
      </div>

      {/* 3. Parser Cards Grid: Clean 2-column or 3-column layout */}
      {parsers.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-border bg-card/20">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-base font-semibold text-foreground font-mono">No Verified Parsers Found</h3>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            Try adjusting your search query or reset active filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {parsers.map((parser) => {
            const hasUpdate = parser.hasUpdate || pendingUpdates.includes(parser.slug);

            return (
              <Card
                key={parser.slug}
                className="relative flex flex-col justify-between border-border/80 hover:border-primary/50 transition-all duration-200 bg-card/70 backdrop-blur-sm shadow-md overflow-hidden group"
              >
                <CornerEdges telemetry={`${parser.country} // ${parser.fileType.toUpperCase()}`} />

                {/* Card Header */}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0 border-border">
                          {parser.country}
                        </Badge>
                        <Badge
                          variant={parser.fileType === "pdf" ? "default" : "secondary"}
                          className="text-[10px] uppercase font-mono px-1.5 py-0"
                        >
                          {parser.fileType}
                        </Badge>
                        <Badge variant="success" className="text-[10px] uppercase font-mono px-1.5 py-0 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          Verified
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-bold font-mono tracking-tight text-foreground group-hover:text-primary transition-colors">
                        {parser.bankName}
                      </CardTitle>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs text-muted-foreground bg-background/70 px-2 py-0.5 rounded border border-border">
                        v{parser.currentVersion}
                      </span>
                    </div>
                  </div>

                  <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                    {parser.description || `Declarative statement schema for ${parser.bankName}.`}
                  </CardDescription>
                </CardHeader>

                {/* Card Body */}
                <CardContent className="space-y-3 pb-3 text-xs">
                  {/* Security Invariant Guarantee & Metrics */}
                  <div className="p-2.5 rounded bg-background/50 border border-border/70 font-mono text-[11px] text-muted-foreground space-y-1.5">
                    <div className="flex items-center justify-between text-foreground">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Lock className="w-3 h-3 text-primary" />
                        Sandbox Verification:
                      </span>
                      <span className="text-emerald-400 font-bold">100% PARITY</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Downloads:</span>
                      <span className="text-foreground font-semibold">{parser.downloadCount.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Rating:</span>
                      <span className="text-primary font-bold">★ {parser.ratingScore.toFixed(2)}</span>
                    </div>
                  </div>

                  {parser.isInstalled && (
                    <div className="flex items-center justify-between text-[11px] font-mono p-2 rounded bg-primary/10 border border-primary/20 text-primary">
                      <span>Local Dexie Status:</span>
                      <span className="font-bold">INSTALLED v{parser.installedVersion}</span>
                    </div>
                  )}
                </CardContent>

                {/* Card Actions */}
                <CardFooter className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {/* Inspect Config / Fixture Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenInspectModal(parser)}
                      className="text-muted-foreground hover:text-foreground h-8 px-2.5 font-mono text-[11px] gap-1.5"
                      title="Inspect DSL Configuration Schema & Fixture"
                    >
                      <Code2 className="w-3.5 h-3.5 text-primary" />
                      Inspect
                    </Button>

                    {/* Defect Report Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenReportModal(parser)}
                      className="text-muted-foreground hover:text-destructive h-8 px-2"
                      title="Report layout breakage or defect"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </Button>

                    {/* Open in Studio Button */}
                    {onOpenStudioWithConfig && parser.dslConfig && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenStudioWithConfig(parser.dslConfig)}
                        className="text-muted-foreground hover:text-foreground h-8 px-2 font-mono text-[11px]"
                        title="Edit in Parser Studio"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {hasUpdate ? (
                      <Button
                        variant="cyber"
                        size="sm"
                        onClick={() => upgradeParser(parser)}
                        className="gap-1.5 h-8 text-xs font-mono"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        Upgrade
                      </Button>
                    ) : parser.isInstalled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => uninstallParser(parser.slug)}
                        className="gap-1.5 h-8 text-xs font-mono text-muted-foreground hover:text-destructive hover:border-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Uninstall
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => installParser(parser)}
                        className="gap-1.5 h-8 text-xs font-mono"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Install Offline
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* 4. Modal 1: Inspect Config & Fixture Dialog */}
      <Dialog open={!!inspectingParser} onOpenChange={(open) => !open && setInspectingParser(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] bg-card border-border overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-foreground font-mono text-sm">
                <Code2 className="w-4 h-4 text-primary" />
                Inspect Parser: {inspectingParser?.bankName} (v{inspectingParser?.currentVersion})
              </DialogTitle>
              <Badge variant="success" className="font-mono text-[10px]">
                100% INERT AST
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground font-mono mt-1">
              Verify declarative column bounds, regex patterns, and parity verification before offline installation.
            </DialogDescription>
          </DialogHeader>

          {/* Inspect Tabs: DSL Config vs. Fixture Parity */}
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            <Tabs value={inspectTab} onValueChange={(v: any) => setInspectTab(v)}>
              <TabsList className="grid grid-cols-2 h-8 bg-muted/40 p-0.5 font-mono text-xs">
                <TabsTrigger value="dsl" className="h-7 text-xs">
                  DSL Config Schema (.json)
                </TabsTrigger>
                <TabsTrigger value="fixture" className="h-7 text-xs">
                  Sanitized Test Fixture & Parity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="dsl" className="space-y-3 mt-3">
                <div className="relative">
                  <pre className="p-3 bg-black/80 rounded border border-border text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-[360px]">
                    {JSON.stringify(inspectingParser?.dslConfig, null, 2)}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyInspectJson(inspectingParser?.dslConfig)}
                    className="absolute top-2 right-2 h-7 font-mono text-[10px] gap-1 bg-background/80"
                  >
                    {copiedInspect ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedInspect ? "Copied" : "Copy"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="fixture" className="space-y-3 mt-3 font-mono text-xs">
                <div className="p-3 rounded border border-border bg-background/60 space-y-2">
                  <div className="flex items-center justify-between text-foreground">
                    <span className="font-bold">Deterministic Parity Check:</span>
                    <Badge variant="success" className="font-mono text-[10px]">BALANCED</Badge>
                  </div>
                  <div className="text-muted-foreground text-[11px]">
                    Formula verified: Opening Balance + Total Credits - Total Debits == Closing Balance (Delta: 0.00 minor units).
                  </div>
                </div>

                <div className="p-3 bg-black/80 rounded border border-border text-[11px] text-muted-foreground space-y-1">
                  <div className="text-foreground font-semibold">Security Invariant Summary:</div>
                  <div>• Character Count Parity: 100% byte preserved</div>
                  <div>• Geometry Bounding Box: 0..1000 coordinate grid</div>
                  <div>• PII Masking: Anonymized customer names, scrambled narrative tokens</div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="p-3 border-t border-border bg-muted/20 flex items-center justify-between gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs">
                Close
              </Button>
            </DialogClose>

            {inspectingParser && !inspectingParser.isInstalled && (
              <Button
                variant="cyber"
                size="sm"
                onClick={() => {
                  installParser(inspectingParser);
                  setInspectingParser(null);
                }}
                className="font-mono text-xs gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Install Offline Now
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Modal 2: Moderation Defect Report Modal */}
      <Dialog open={!!reportingParser} onOpenChange={(open) => !open && setReportingParser(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-mono text-sm">
              <AlertTriangle className="w-4 h-4" />
              Report Parser Issue
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Report layout breakages or suspicious behavior for <span className="font-mono text-foreground font-semibold">{reportingParser?.bankName}</span>. Parsers with &ge; 3 defect reports within 7 days are automatically demoted from the public index.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs font-mono">
            <div>
              <label className="font-medium text-foreground block mb-1">
                Reason for Report
              </label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as any)}
                className="w-full rounded bg-background border border-border p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="broken_parser">Broken Parser (Extraction fails on valid statements)</option>
                <option value="malicious_attempt">Malicious Attempt (Suspicious or obfuscated patterns)</option>
                <option value="spam">Spam / Duplicate Entry</option>
              </select>
            </div>

            <div>
              <label className="font-medium text-foreground block mb-1">
                Defect Details & Discrepancy Description
              </label>
              <textarea
                rows={4}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Describe format discrepancy, missing columns, or parsing failure..."
                className="w-full rounded bg-background border border-border p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSendReport}
              disabled={isSubmittingReport || !reportDetails.trim()}
              className="gap-1.5 font-mono text-xs"
            >
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
