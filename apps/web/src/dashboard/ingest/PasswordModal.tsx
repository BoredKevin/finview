/**
 * Password Prompt Modal for Encrypted PDFs
 * 
 * Invariant 1: Zero Data Egress
 * Passwords are held strictly in ephemeral React state, passed to worker memory,
 * and cleared immediately. Never written to IndexedDB, localStorage, or network.
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Badge,
} from "@boredkevin/ui";
import { Lock, KeyRound, ShieldCheck, Eye, EyeOff } from "lucide-react";

interface PasswordModalProps {
  open: boolean;
  fileName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  errorMessage?: string;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  open,
  fileName,
  onSubmit,
  onCancel,
  errorMessage,
}) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    const submittedPassword = password;
    setPassword(""); // Clear ephemeral state immediately
    onSubmit(submittedPassword);
  };

  const handleCancel = () => {
    setPassword("");
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(openState) => !openState && handleCancel()}>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-md border-border">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 font-mono text-[10px] gap-1">
                <Lock className="h-3 w-3" />
                ENCRYPTED DOCUMENT
              </Badge>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1">
                <ShieldCheck className="h-3 w-3" />
                EPHEMERAL RAM
              </Badge>
            </div>
            <DialogTitle className="text-base font-mono tracking-tight text-foreground flex items-center gap-2 mt-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Enter Document Password
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              <span className="font-mono text-foreground font-semibold">{fileName}</span> is password-protected.
              Provide your decryption key (e.g. Date of Birth or Mother's Name according to bank policy).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="pdf-password-input" className="text-xs font-mono text-muted-foreground">
              PDF Password
            </label>
            <div className="relative">
              <Input
                id="pdf-password-input"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {errorMessage && (
              <p className="text-xs text-destructive font-mono mt-1">
                {errorMessage}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="cyber"
              size="sm"
              disabled={!password.trim()}
              className="font-mono text-xs gap-1.5"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Unlock & Parse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
