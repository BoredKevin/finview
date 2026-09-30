/**
 * 1-Click Marketplace Parser Install Modal
 * 
 * Prompted when an uploaded statement has no local Dexie configuration,
 * but matches a verified bank signature in the Convex Marketplace.
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from "@boredkevin/ui";
import { DownloadCloud, CheckCircle2, ShieldCheck, Sparkles, Building2 } from "lucide-react";
import { MarketplaceMatch } from "./types.js";

interface MarketplaceInstallModalProps {
  open: boolean;
  fileName: string;
  match: MarketplaceMatch | null;
  onInstallAndParse: () => void;
  onCancel: () => void;
  isInstalling?: boolean;
}

export const MarketplaceInstallModal: React.FC<MarketplaceInstallModalProps> = ({
  open,
  fileName,
  match,
  onInstallAndParse,
  onCancel,
  isInstalling = false,
}) => {
  if (!match) return null;

  return (
    <Dialog open={open} onOpenChange={(openState) => !openState && onCancel()}>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-md border-primary/40">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-mono text-[10px] gap-1">
              <Sparkles className="h-3 w-3" />
              MARKETPLACE MATCH FOUND
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1">
              <ShieldCheck className="h-3 w-3" />
              VERIFIED DSL
            </Badge>
          </div>

          <DialogTitle className="text-base font-mono tracking-tight text-foreground flex items-center gap-2 mt-2">
            <Building2 className="h-4 w-4 text-primary" />
            {match.bankName}
          </DialogTitle>

          <DialogDescription className="text-xs text-muted-foreground">
            A verified parser configuration matching <span className="font-mono text-foreground font-semibold">{fileName}</span> is available in the decentralized registry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 font-mono text-xs border-y border-border/60 py-3 my-1">
          <div className="grid grid-cols-2 gap-2 bg-background/50 p-2.5 rounded border border-border">
            <div>
              <span className="text-muted-foreground text-[10px] uppercase block">Parser Slug:</span>
              <span className="text-foreground font-semibold truncate block">{match.slug}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] uppercase block">Version:</span>
              <span className="text-foreground font-semibold block">v{match.currentVersion}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] uppercase block">Format:</span>
              <span className="text-foreground font-semibold uppercase block">{match.fileType}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] uppercase block">Match Score:</span>
              <span className="text-emerald-400 font-semibold block">{match.matchScore}%</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Installing this configuration stores it permanently in your local IndexedDB for future 100% offline statement parsing with zero latency.
          </p>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isInstalling}
            className="font-mono text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="cyber"
            size="sm"
            onClick={onInstallAndParse}
            disabled={isInstalling}
            className="font-mono text-xs gap-1.5"
          >
            <DownloadCloud className="h-3.5 w-3.5" />
            {isInstalling ? "Installing..." : "1-Click Install & Parse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
