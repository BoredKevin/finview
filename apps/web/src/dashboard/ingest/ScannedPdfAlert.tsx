/**
 * Scanned PDF Guidance Alert Modal
 * 
 * Informs the user when an uploaded PDF statement contains zero text spans
 * (i.e. scanned image rather than a vector e-statement).
 * Enforces Zero Data Egress: FinView never sends document images to third-party OCR clouds.
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
import { FileWarning, ShieldAlert, Download, X } from "lucide-react";

interface ScannedPdfAlertProps {
  open: boolean;
  fileName: string;
  onClose: () => void;
}

export const ScannedPdfAlert: React.FC<ScannedPdfAlertProps> = ({
  open,
  fileName,
  onClose,
}) => {
  return (
    <Dialog open={open} onOpenChange={(openState) => !openState && onClose()}>
      <DialogContent className="max-w-lg bg-card/95 backdrop-blur-md border-amber-500/30">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 font-mono text-[10px] gap-1">
              <FileWarning className="h-3 w-3" />
              SCANNED DOCUMENT DETECTED
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1">
              <ShieldAlert className="h-3 w-3" />
              NO CLOUD OCR
            </Badge>
          </div>
          <DialogTitle className="text-base font-mono tracking-tight text-foreground flex items-center gap-2 mt-2">
            No Searchable Digital Text Found
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            <span className="font-mono text-foreground font-semibold">{fileName}</span> consists entirely of scanned image layers with zero extractable text spans.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 font-mono text-xs text-muted-foreground border-y border-border/60 py-3 my-1">
          <p className="text-foreground leading-relaxed">
            FinView operates under a strict <strong className="text-primary font-bold">Zero Data Egress</strong> invariant. To protect your financial sovereignty, raw banking documents are never transmitted to external third-party cloud OCR services.
          </p>

          <div className="bg-background/60 p-3 rounded border border-border space-y-2">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5 text-primary" />
              How to export a digital e-statement:
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground">
              <li>Log in to your bank's official internet banking portal or mobile app.</li>
              <li>Navigate to <em>e-Statement / Rekening Koran / Transaction History</em>.</li>
              <li>Select your statement period and click <strong>Download PDF</strong> (not a screenshot or scan).</li>
              <li>Verify that you can highlight or select text inside the downloaded PDF before re-uploading.</li>
            </ol>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="font-mono text-xs gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
