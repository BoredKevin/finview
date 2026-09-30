/**
 * Unified Ingestion Dropzone & Pipeline Orchestrator Component
 * 
 * Provides drag-and-drop upload for PDF & CSV bank statements.
 * Orchestrates worker inspection, 4-tier parser matching,
 * password handling, scanned document alerts, marketplace install,
 * and direct handoff to Parser Studio with preloaded document spans.
 */

import React, { useState, useRef, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Dialog,
  DialogContent,
} from "@boredkevin/ui";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  ShieldCheck,
  Cpu,
  Loader2,
  Wrench,
  AlertCircle,
  Sparkles,
  Lock,
} from "lucide-react";
import { AppDB } from "../../db/database.js";
import { Account } from "../../db/types.js";
import { StudioDocument } from "../../studio/types.js";
import {
  IngestionResult,
  IngestionStep,
  MarketplaceMatch,
  ReconciliationItem,
} from "./types.js";
import {
  inspectAndResolveParser,
  executeDocumentParse,
  commitTransactionsToDexie,
} from "./IngestionPipeline.js";
import { PasswordModal } from "./PasswordModal.js";
import { ScannedPdfAlert } from "./ScannedPdfAlert.js";
import { MarketplaceInstallModal } from "./MarketplaceInstallModal.js";
import { ReconciliationScreen } from "./ReconciliationScreen.js";
import { installParser } from "../../db/installedParsers.js";

interface IngestionDropzoneProps {
  db: AppDB;
  accounts: Account[];
  activeAccountId?: string;
  onOpenStudio?: (document: StudioDocument) => void;
  onIngestSuccess?: (count: number) => void;
  workerClient?: any;
  convexClient?: any;
}

export const IngestionDropzone: React.FC<IngestionDropzoneProps> = ({
  db,
  accounts,
  activeAccountId,
  onOpenStudio,
  onIngestSuccess,
  workerClient,
  convexClient,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [step, setStep] = useState<IngestionStep>("idle");
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ currentPage: number; totalPages: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [scannedAlertOpen, setScannedAlertOpen] = useState(false);
  const [marketplaceMatch, setMarketplaceMatch] = useState<MarketplaceMatch | null>(null);
  const [marketplaceModalOpen, setMarketplaceModalOpen] = useState(false);
  const [isInstallingMarketplace, setIsInstallingMarketplace] = useState(false);
  const [reconciliationItems, setReconciliationItems] = useState<ReconciliationItem[]>([]);
  const [studioHandoffDoc, setStudioHandoffDoc] = useState<StudioDocument | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetAccountId = activeAccountId || (accounts.length > 0 ? accounts[0].id : "acc_default");

  // Reset ingestion state
  const handleReset = () => {
    setStep("idle");
    setActiveFile(null);
    setProgress(null);
    setErrorMessage(null);
    setPasswordModalOpen(false);
    setScannedAlertOpen(false);
    setMarketplaceModalOpen(false);
    setMarketplaceMatch(null);
    setReconciliationItems([]);
    setStudioHandoffDoc(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Process selected file
  const handleFileProcess = async (file: File, password?: string) => {
    setActiveFile(file);
    setStep("inspecting");
    setErrorMessage(null);

    const inspection = await inspectAndResolveParser({
      db,
      file,
      accountId: targetAccountId,
      password,
      workerClient,
      convexClient,
      onProgress: (p) => setProgress(p),
    });

    if (inspection.step === "password_required") {
      setStep("password_required");
      setPasswordModalOpen(true);
      return;
    }

    if (inspection.step === "scanned_detected") {
      setStep("scanned_detected");
      setScannedAlertOpen(true);
      return;
    }

    if (inspection.step === "marketplace_prompt" && inspection.marketplaceMatch) {
      setStep("marketplace_prompt");
      setMarketplaceMatch(inspection.marketplaceMatch);
      setMarketplaceModalOpen(true);
      return;
    }

    if (inspection.step === "parsing" && inspection.matchedParser) {
      setStep("parsing");
      const config =
        "dslConfig" in inspection.matchedParser
          ? inspection.matchedParser.dslConfig
          : inspection.matchedParser;

      const parseResult = await executeDocumentParse(
        {
          db,
          file,
          accountId: targetAccountId,
          password,
          workerClient,
          convexClient,
          onProgress: (p) => setProgress(p),
        },
        config
      );

      if (parseResult.step === "reconciling" && parseResult.reconciliationItems) {
        setReconciliationItems(parseResult.reconciliationItems);
        setStep("reconciling");
      } else {
        setStep("error");
        setErrorMessage(parseResult.errorMessage || "Statement parsing failed");
      }
      return;
    }

    // Unmatched - Level 4 Studio Handoff
    if (inspection.studioDocument) {
      setStudioHandoffDoc(inspection.studioDocument);
      setStep("idle");
      setErrorMessage(
        "No matching parser layout found. Click 'Open in Parser Studio' to visually calibrate columns."
      );
      return;
    }

    if (inspection.step === "error") {
      setStep("error");
      setErrorMessage(inspection.errorMessage || "Failed to process statement");
    }
  };

  // Password submission handler
  const handlePasswordSubmit = async (password: string) => {
    setPasswordModalOpen(false);
    if (!activeFile) return;
    await handleFileProcess(activeFile, password);
  };

  // 1-Click marketplace install handler
  const handleInstallMarketplaceParser = async () => {
    if (!marketplaceMatch || !activeFile) return;
    setIsInstallingMarketplace(true);

    try {
      const config = JSON.parse(marketplaceMatch.dslConfig);
      await installParser(db, {
        slug: marketplaceMatch.slug,
        bankName: marketplaceMatch.bankName,
        country: marketplaceMatch.country,
        fileType: marketplaceMatch.fileType,
        version: marketplaceMatch.currentVersion,
        dslConfig: config,
      });

      setMarketplaceModalOpen(false);
      setIsInstallingMarketplace(false);

      // Immediately parse with installed config
      setStep("parsing");
      const parseResult = await executeDocumentParse(
        {
          db,
          file: activeFile,
          accountId: targetAccountId,
          workerClient,
          convexClient,
          onProgress: (p) => setProgress(p),
        },
        config
      );

      if (parseResult.step === "reconciling" && parseResult.reconciliationItems) {
        setReconciliationItems(parseResult.reconciliationItems);
        setStep("reconciling");
      } else {
        setStep("error");
        setErrorMessage(parseResult.errorMessage || "Parsing failed after install");
      }
    } catch (err: any) {
      setIsInstallingMarketplace(false);
      setErrorMessage(`Failed to install parser: ${err.message}`);
    }
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFileProcess(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileProcess(file);
    }
  };

  // Commit selected items into Dexie
  const handleCommitReconciliation = async (
    targetAccId: string,
    selectedItems: ReconciliationItem[]
  ) => {
    setIsCommitting(true);
    try {
      const txs = selectedItems.map((it) => it.transaction);
      const result = await commitTransactionsToDexie(db, targetAccId, txs);

      if (result.errors.length > 0) {
        console.warn("Some transactions encountered commit warnings:", result.errors);
      }

      setStep("committed");
      if (onIngestSuccess) {
        onIngestSuccess(result.insertedCount);
      }
    } catch (err: any) {
      setErrorMessage(`Commit to Dexie failed: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Sleek Compact Dropzone Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => step === "idle" && fileInputRef.current?.click()}
        className={`relative rounded-lg p-4 transition-all cursor-pointer border border-dashed flex flex-col sm:flex-row items-center justify-between gap-4 ${
          isDragOver
            ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
            : "border-border/80 hover:border-primary/60 bg-card/60 hover:bg-card/90"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv"
          onChange={handleFileInputChange}
          className="hidden"
          style={{ display: "none" }}
          aria-hidden="true"
          tabIndex={-1}
          id="finview-statement-dropzone-input"
        />

        {/* Left: Icon & Text Narrative */}
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            {step === "inspecting" || step === "parsing" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <UploadCloud className="h-5 w-5" />
            )}
          </div>

          <div>
            <div className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <span>{step === "inspecting" ? "Inspecting Signatures..." : step === "parsing" ? "Parsing Transactions via Worker..." : "Ingest Bank Statement"}</span>
              {step === "committed" && (
                <Badge variant="success" className="font-mono text-[10px] py-0">COMMITTED</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {activeFile ? (
                <span className="font-mono text-primary font-medium">{activeFile.name} {progress && `(Page ${progress.currentPage}/${progress.totalPages})`}</span>
              ) : (
                <>Drop <span className="font-mono text-primary font-semibold">.pdf</span> e-statements or <span className="font-mono text-primary font-semibold">.csv</span> export files, or click to browse.</>
              )}
            </div>
          </div>
        </div>

        {/* Right: Action Trigger */}
        <div className="flex items-center gap-2.5 shrink-0">

          <Button
            type="button"
            variant="cyber"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="font-mono text-xs gap-1.5 h-8"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Select Statement
          </Button>
        </div>
      </div>

      {/* Staging Modal Dialog: Extracted Rows & Confidence Scores */}
      <Dialog
        open={step === "reconciling"}
        onOpenChange={(open) => {
          if (!open) handleReset();
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0 bg-card border-border">
          <ReconciliationScreen
            items={reconciliationItems}
            accounts={accounts}
            defaultAccountId={targetAccountId}
            onCommit={handleCommitReconciliation}
            onCancel={handleReset}
            isCommitting={isCommitting}
          />
        </DialogContent>
      </Dialog>

      {/* Unmatched Banner / Error Message */}
      {errorMessage && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="text-xs font-mono text-foreground">{errorMessage}</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {studioHandoffDoc && onOpenStudio && (
                <Button
                  variant="cyber"
                  size="sm"
                  onClick={() => onOpenStudio(studioHandoffDoc)}
                  className="font-mono text-xs gap-1.5"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Open in Parser Studio
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Password Modal */}
      <PasswordModal
        open={passwordModalOpen}
        fileName={activeFile?.name || "Statement.pdf"}
        onSubmit={handlePasswordSubmit}
        onCancel={handleReset}
      />

      {/* Scanned PDF Alert Modal */}
      <ScannedPdfAlert
        open={scannedAlertOpen}
        fileName={activeFile?.name || "Statement.pdf"}
        onClose={handleReset}
      />

      {/* 1-Click Marketplace Install Modal */}
      <MarketplaceInstallModal
        open={marketplaceModalOpen}
        fileName={activeFile?.name || "Statement.pdf"}
        match={marketplaceMatch}
        onInstallAndParse={handleInstallMarketplaceParser}
        onCancel={handleReset}
        isInstalling={isInstallingMarketplace}
      />
    </div>
  );
};
