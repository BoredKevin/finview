/**
 * Parser Marketplace UI Component
 * 
 * Decentralized registry for discovering, verifying, installing, and reporting
 * declarative statement parser configurations.
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
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  CornerEdges,
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
} from "lucide-react";

import { useMarketplace } from "./useMarketplace.js";
import { MarketplaceParserItem, ReportParserInput } from "./types.js";

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

  const handleOpenReportModal = (parser: MarketplaceParserItem) => {
    setReportingParser(parser);
    setReportReason("broken_parser");
    setReportDetails("");
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

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 text-foreground">
      {/* Marketplace Header */}
      <div className="relative rounded-lg p-6 bg-card/60 backdrop-blur-md border border-border shadow-2xl overflow-hidden">
        <CornerEdges telemetry="REGISTRY // SECURE-MARKETPLACE-v1" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono tracking-widest text-primary uppercase">
                [FINVIEW PROTOCOL // MARKETPLACE]
              </span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                Non-Executable AST
              </Badge>
              <Badge variant="success" className="text-[10px] uppercase font-mono tracking-wider">
                100% Deterministic Verification
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Statement Parser Registry
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Discover, install, and audit declarative bank statement schemas. Every configuration is strictly inert JSON, verified against sanitized fixtures with 100% mathematical ledger parity.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded border border-border bg-background/50 font-mono text-xs">
              <span className="text-muted-foreground">INSTALLED:</span>{" "}
              <span className="text-primary font-bold">{installedCount}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshCatalog}
              disabled={isLoading}
              className="gap-2"
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
              <CheckCircle2 className="w-4 h-4 text-primary" />
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

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card/40 p-4 rounded-lg border border-border/80">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search bank name, slug, or tags..."
            value={filter.searchQuery}
            onChange={(e) => setFilter({ ...filter, searchQuery: e.target.value })}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {/* File Type Filter */}
          <div className="flex rounded border border-border bg-background/60 p-0.5 text-xs font-mono">
            <button
              onClick={() => setFilter({ ...filter, fileType: "all" })}
              className={`px-3 py-1 rounded transition-colors ${
                filter.fileType === "all" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setFilter({ ...filter, fileType: "pdf" })}
              className={`px-3 py-1 rounded transition-colors ${
                filter.fileType === "pdf" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PDF
            </button>
            <button
              onClick={() => setFilter({ ...filter, fileType: "csv" })}
              className={`px-3 py-1 rounded transition-colors ${
                filter.fileType === "csv" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CSV
            </button>
          </div>

          {/* Country Filter */}
          <div className="flex rounded border border-border bg-background/60 p-0.5 text-xs font-mono">
            <button
              onClick={() => setFilter({ ...filter, country: undefined })}
              className={`px-2.5 py-1 rounded transition-colors ${
                !filter.country ? "bg-secondary text-secondary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              GLOBAL
            </button>
            <button
              onClick={() => setFilter({ ...filter, country: "ID" })}
              className={`px-2.5 py-1 rounded transition-colors ${
                filter.country === "ID" ? "bg-secondary text-secondary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ID (Indonesia)
            </button>
          </div>
        </div>
      </div>

      {/* Parser Cards Grid */}
      {parsers.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-border bg-card/20">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-base font-semibold text-foreground">No Verified Parsers Found</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Try adjusting your search query or clear active filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {parsers.map((parser) => {
            const hasUpdate = parser.hasUpdate || pendingUpdates.includes(parser.slug);

            return (
              <Card
                key={parser.slug}
                className="relative flex flex-col justify-between border-border/80 hover:border-primary/50 transition-all duration-200 bg-card/60 backdrop-blur-sm shadow-lg overflow-hidden group"
              >
                <CornerEdges telemetry={`${parser.country} // ${parser.fileType.toUpperCase()}`} />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
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
                      <CardTitle className="text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
                        {parser.bankName}
                      </CardTitle>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-xs text-muted-foreground bg-background/60 px-2 py-0.5 rounded border border-border">
                        v{parser.currentVersion}
                      </span>
                    </div>
                  </div>

                  <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                    {parser.description || `Declarative statement schema for ${parser.bankName}.`}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 pb-3 text-xs">
                  {/* Security Invariant Guarantee */}
                  <div className="p-2 rounded bg-background/50 border border-border/60 font-mono text-[11px] text-muted-foreground space-y-1">
                    <div className="flex items-center justify-between text-foreground">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-primary" />
                        Sandbox Verification:
                      </span>
                      <span className="text-success font-semibold">100% PARITY</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Downloads:</span>
                      <span className="text-foreground">{parser.downloadCount.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Rating:</span>
                      <span className="text-primary font-semibold">★ {parser.ratingScore.toFixed(2)}</span>
                    </div>
                  </div>

                  {parser.isInstalled && (
                    <div className="flex items-center justify-between text-[11px] font-mono p-1.5 rounded bg-primary/10 border border-primary/20 text-primary">
                      <span>Local Dexie Status:</span>
                      <span>ACTIVE v{parser.installedVersion}</span>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenReportModal(parser)}
                      className="text-muted-foreground hover:text-destructive h-8 px-2"
                      title="Report issue or defect"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </Button>

                    {onOpenStudioWithConfig && parser.dslConfig && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenStudioWithConfig(parser.dslConfig)}
                        className="text-muted-foreground hover:text-foreground h-8 px-2 font-mono text-[11px]"
                        title="Inspect in Parser Studio"
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

      {/* Moderation Defect Report Modal */}
      <Dialog open={!!reportingParser} onOpenChange={(open) => !open && setReportingParser(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Report Parser Issue
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Report layout breakages or suspicious behavior for <span className="font-mono text-foreground font-semibold">{reportingParser?.bankName}</span>. Parsers with $\ge 3$ defect reports within 7 days are automatically demoted and removed from the public index.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
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
                placeholder="Describe the format discrepancy, missing columns, or parsing failure..."
                className="w-full rounded bg-background border border-border p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSendReport}
              disabled={isSubmittingReport || !reportDetails.trim()}
              className="gap-1.5"
            >
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
