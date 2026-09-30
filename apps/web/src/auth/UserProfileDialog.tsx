/**
 * FinView User Profile & Master Password Dialog
 * 
 * Built with @boredkevin/ui:
 * - Guests: Tabbed interface for Sign In and Sign Up.
 * - Authenticated: Profile telemetry, E2EE sync indicators, atomic master password re-keying, and sign out.
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Avatar,
  AvatarFallback,
  Separator,
} from "@boredkevin/ui";
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Mail,
  User as UserIcon,
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Cloud,
} from "lucide-react";
import { useAuth, formatRelativeSyncTime } from "./AuthContext.js";

export const UserProfileDialog: React.FC = () => {
  let authContext: any = null;
  try {
    authContext = useAuth();
  } catch {}

  if (!authContext) return null;

  const {
    user,
    isAuthenticated,
    isAuthModalOpen,
    authModalInitialTab,
    closeAuthModal,
    signIn,
    signUp,
    changePassword,
    signOut,
    syncStatus,
    lastSyncedAt,
    isLoading,
  } = authContext;

  // Active tab state
  const [activeTab, setActiveTab] = useState<string>("signin");

  // Sign in form state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);

  // Sign up form state
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [signUpError, setSignUpError] = useState<string | null>(null);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  // Synchronize modal open tab
  React.useEffect(() => {
    if (isAuthModalOpen) {
      setActiveTab(authModalInitialTab);
      setSignInError(null);
      setSignUpError(null);
      setPwError(null);
      setPwSuccess(null);
    }
  }, [isAuthModalOpen, authModalInitialTab]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);
    try {
      await signIn(signInEmail, signInPassword);
    } catch (err: any) {
      setSignInError(err.message || "Failed to sign in. Please verify credentials.");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError(null);

    if (signUpPassword !== signUpConfirmPassword) {
      setSignUpError("Passwords do not match.");
      return;
    }

    if (signUpPassword.length < 6) {
      setSignUpError("Master password must be at least 6 characters.");
      return;
    }

    try {
      await signUp(signUpEmail, signUpPassword, signUpName);
    } catch (err: any) {
      setSignUpError(err.message || "Sign up failed. Please try again.");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (newPassword !== confirmNewPassword) {
      setPwError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      setPwError("New master password must be at least 6 characters.");
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      setPwSuccess("Master password updated and local vault keys re-encrypted!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      setPwError(err.message || "Password update failed. Check current password.");
    }
  };

  const userInitials = (user?.name || user?.email || "KV")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(open) => !open && closeAuthModal()}>
      <DialogContent className="sm:max-w-md bg-card/95 border-border shadow-2xl backdrop-blur-xl">
        {isAuthenticated && user ? (
          /* ========================================================================= */
          /* Authenticated Mode: Profile & Security Telemetry & Password Change        */
          /* ========================================================================= */
          <div className="space-y-5">
            <DialogHeader className="text-left space-y-1">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-mono uppercase tracking-wider text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Account & Vault Security
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px]"
                >
                  E2EE SYNC ACTIVE
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground font-mono">
                Manage your credentials and local AES-GCM-256 key envelope.
              </DialogDescription>
            </DialogHeader>

            {/* User Profile Card */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 flex items-center gap-3.5">
              <Avatar className="h-10 w-10 border border-primary/40">
                <AvatarFallback className="bg-primary/20 text-primary font-mono font-bold text-sm">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="overflow-hidden flex-1">
                <div className="font-mono text-sm font-bold text-foreground truncate">
                  {user.name || "FinView Master"}
                </div>
                <div className="font-mono text-xs text-muted-foreground truncate">
                  {user.email}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground bg-card/80 px-2.5 py-1 rounded border border-border/80 shrink-0">
                <Cloud className="h-3 w-3 text-emerald-400" />
                <span>{formatRelativeSyncTime(lastSyncedAt)}</span>
              </div>
            </div>

            <Separator className="bg-border/60" />

            {/* Change Password Section */}
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-foreground uppercase tracking-wider">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                Change Master Password
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Derives a new 256-bit KEK via PBKDF2 (600,000 iterations) and atomically re-wraps
                your local Dexie vault encryption key.
              </p>

              {pwError && (
                <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/40 text-rose-400 text-xs font-mono flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{pwError}</span>
                </div>
              )}

              {pwSuccess && (
                <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{pwSuccess}</span>
                </div>
              )}

              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                    Current Password
                  </label>
                  <Input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-8 font-mono text-xs bg-background/80"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                      New Password
                    </label>
                    <Input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="h-8 font-mono text-xs bg-background/80"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                      Confirm New
                    </label>
                    <Input
                      type="password"
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="h-8 font-mono text-xs bg-background/80"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isLoading || !currentPassword || !newPassword}
                className="w-full font-mono text-xs gap-1.5 h-8 border-primary/50 text-primary hover:bg-primary/10 mt-1"
              >
                {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                Update & Re-key Vault
              </Button>
            </form>

            <Separator className="bg-border/60" />

            {/* Dialog Footer Actions */}
            <DialogFooter className="flex items-center justify-between sm:justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={signOut}
                disabled={isLoading}
                className="font-mono text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1.5 h-8"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out & Lock
              </Button>

              <Button
                type="button"
                variant="cyber"
                size="sm"
                onClick={closeAuthModal}
                className="font-mono text-xs h-8 px-4"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ========================================================================= */
          /* Guest Mode: Sign In / Sign Up Tabs                                        */
          /* ========================================================================= */
          <div className="space-y-4">
            <DialogHeader className="text-left space-y-1">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-mono uppercase tracking-wider text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  FinView Authentication
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="border-muted text-muted-foreground bg-muted/20 font-mono text-[10px]"
                >
                  ZERO EGRESS
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground font-mono">
                Enable multi-device end-to-end encrypted cloud sync for your private treasury.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-2 w-full bg-muted/40 p-1 mb-4">
                <TabsTrigger value="signin" className="font-mono text-xs py-1.5">
                  Sign In
                </TabsTrigger>
                <TabsTrigger value="signup" className="font-mono text-xs py-1.5">
                  Sign Up
                </TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="signin" className="space-y-3.5 mt-0">
                <form onSubmit={handleSignIn} className="space-y-3.5">
                  {signInError && (
                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/40 text-rose-400 text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{signInError}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                        Email Address
                      </label>
                      <div className="relative">
                        <Input
                          type="email"
                          required
                          value={signInEmail}
                          onChange={(e) => setSignInEmail(e.target.value)}
                          placeholder="user@example.com"
                          className="h-8 font-mono text-xs bg-background/80"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                        Master Password
                      </label>
                      <Input
                        type="password"
                        required
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="h-8 font-mono text-xs bg-background/80"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="cyber"
                    size="sm"
                    disabled={isLoading || !signInEmail || !signInPassword}
                    className="w-full font-mono text-xs gap-1.5 h-9"
                  >
                    {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    Sign In & Connect Sync
                  </Button>
                </form>
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup" className="space-y-3.5 mt-0">
                <form onSubmit={handleSignUp} className="space-y-3.5">
                  {signUpError && (
                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/40 text-rose-400 text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{signUpError}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                        Full Name / Alias (Optional)
                      </label>
                      <Input
                        type="text"
                        value={signUpName}
                        onChange={(e) => setSignUpName(e.target.value)}
                        placeholder="Kevin"
                        className="h-8 font-mono text-xs bg-background/80"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                        Email Address
                      </label>
                      <Input
                        type="email"
                        required
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="h-8 font-mono text-xs bg-background/80"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                          Master Password
                        </label>
                        <Input
                          type="password"
                          required
                          value={signUpPassword}
                          onChange={(e) => setSignUpPassword(e.target.value)}
                          placeholder="Min 6 chars"
                          className="h-8 font-mono text-xs bg-background/80"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                          Confirm Password
                        </label>
                        <Input
                          type="password"
                          required
                          value={signUpConfirmPassword}
                          onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          className="h-8 font-mono text-xs bg-background/80"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-muted/30 border border-border/60 text-[11px] text-muted-foreground leading-normal font-mono">
                    🛡️ Zero plain-text leaves your browser. Master passwords derive local AES-GCM-256 keys via PBKDF2 (600,000 iterations).
                  </div>

                  <Button
                    type="submit"
                    variant="cyber"
                    size="sm"
                    disabled={isLoading || !signUpEmail || !signUpPassword}
                    className="w-full font-mono text-xs gap-1.5 h-9"
                  >
                    {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    Create Account & Encrypt Vault
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeAuthModal}
                className="w-full font-mono text-xs h-8 text-muted-foreground hover:text-foreground"
              >
                Continue in Local Mode
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
