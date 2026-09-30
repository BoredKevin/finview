/**
 * FinView Unified Global Application Shell (AppLayout)
 * 
 * Provides consistent top-level navigation, minimal cloud sync status,
 * user profile & master password access, and responsive containment
 * across Cockpit, Marketplace, and Parser Studio.
 */

import React, { useState, useEffect } from "react";
import { ThemeProvider, Separator, Button, Avatar, AvatarFallback } from "@boredkevin/ui";
import {
  LayoutDashboard,
  Store,
  Wrench,
  Cloud,
  CloudOff,
  RefreshCw,
  User,
} from "lucide-react";
import { useAuth, formatRelativeSyncTime, UserProfileDialog } from "../../auth/index.js";

export type NavTab = "dashboard" | "marketplace" | "studio";

export interface AppLayoutProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  children: React.ReactNode;
  isStudioActive?: boolean;
  delegatedToWorker?: boolean;
  syncStatus?: "local" | "syncing" | "synced" | "offline";
  onOpenProfile?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeTab,
  onTabChange,
  children,
  isStudioActive = false,
  delegatedToWorker = false,
  syncStatus: propSyncStatus,
  onOpenProfile,
}) => {
  let authContext: any = null;
  try {
    authContext = useAuth();
  } catch {}

  const effectiveSyncStatus =
    propSyncStatus || authContext?.syncStatus || "local";
  const effectiveLastSyncedAt = authContext?.lastSyncedAt || null;
  const user = authContext?.user;
  const isAuthenticated = authContext?.isAuthenticated;
  const openProfile = onOpenProfile || authContext?.openAuthModal;

  const [relativeTime, setRelativeTime] = useState<string>(() =>
    formatRelativeSyncTime(effectiveLastSyncedAt)
  );

  useEffect(() => {
    setRelativeTime(formatRelativeSyncTime(effectiveLastSyncedAt));
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeSyncTime(effectiveLastSyncedAt));
    }, 15000);
    return () => clearInterval(interval);
  }, [effectiveLastSyncedAt]);

  const userInitials = (user?.name || user?.email || "KV")
    .slice(0, 2)
    .toUpperCase();

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans select-none antialiased">
        {/* Global Persistent Sci-Fi Header */}
        <header className="h-14 border-b border-border bg-card/85 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 sticky top-0 shadow-sm">
          {/* Left: Brand Identity & Route Switcher */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => onTabChange("dashboard")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onTabChange("dashboard");
              }}
              title="FinView — Return to Cockpit"
            >
              <div className="w-3.5 h-3.5 bg-primary rotate-45 group-hover:scale-110 transition-transform shadow-[0_0_12px_rgba(var(--primary-rgb),0.7)]" />
              <span className="font-mono text-base font-black tracking-widest uppercase text-foreground">
                FINVIEW
              </span>
              <span className="text-[10px] font-mono text-primary px-1.5 py-0.5 border border-primary/40 rounded bg-primary/10 tracking-wider">
                v1.0.0
              </span>
            </div>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 bg-muted/40 p-1 rounded border border-border/80">
              <button
                type="button"
                id="nav-tab-dashboard"
                onClick={() => onTabChange("dashboard")}
                className={`px-3 py-1.5 text-xs font-mono rounded flex items-center gap-1.5 transition-all duration-150 ${
                  activeTab === "dashboard"
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>Cockpit</span>
              </button>

              <button
                type="button"
                id="nav-tab-marketplace"
                onClick={() => onTabChange("marketplace")}
                className={`px-3 py-1.5 text-xs font-mono rounded flex items-center gap-1.5 transition-all duration-150 ${
                  activeTab === "marketplace"
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <Store className="h-3.5 w-3.5" />
                <span>Marketplace</span>
              </button>

              <button
                type="button"
                id="nav-tab-studio"
                onClick={() => onTabChange("studio")}
                className={`px-3 py-1.5 text-xs font-mono rounded flex items-center gap-1.5 transition-all duration-150 ${
                  activeTab === "studio"
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Parser Studio</span>
              </button>
            </nav>
          </div>

          {/* Right: Minimalist Cloud Sync & Profile Access (No Cognitive Overload) */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Cloud Sync Status Indicator */}
            <div
              id="topbar-sync-status-indicator"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border/80 bg-background/50 font-mono text-xs select-none transition-colors"
              title={
                effectiveSyncStatus === "synced"
                  ? `Zero-knowledge encrypted cloud sync active. (${relativeTime})`
                  : effectiveSyncStatus === "syncing"
                  ? "Encrypting and synchronizing data with Convex..."
                  : "Local-first storage active in Dexie. No remote sync."
              }
            >
              {effectiveSyncStatus === "syncing" ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin" />
                  <span className="text-primary font-medium">Syncing...</span>
                </>
              ) : effectiveSyncStatus === "synced" ? (
                <>
                  <Cloud className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-foreground/90 font-medium">{relativeTime}</span>
                </>
              ) : (
                <>
                  <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground font-medium">Local</span>
                </>
              )}
            </div>

            {/* User Profile Avatar Trigger */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              id="nav-user-profile-btn"
              onClick={() => openProfile && openProfile()}
              title={isAuthenticated ? `Account: ${user?.email}` : "Sign In / Create Account"}
              className="h-8 w-8 rounded-full p-0 border border-border/80 hover:border-primary/60 bg-muted/40 hover:bg-muted/80 relative shrink-0 transition-colors"
            >
              <Avatar className="h-7 w-7 rounded-full">
                <AvatarFallback className="text-[11px] font-mono font-bold bg-primary/20 text-primary">
                  {isAuthenticated ? (
                    userInitials
                  ) : (
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </AvatarFallback>
              </Avatar>
              {isAuthenticated && (
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-card" />
              )}
            </Button>
          </div>
        </header>

        {/* User Profile & Auth Modal Dialog */}
        <UserProfileDialog />

        {/* View Content Surface */}
        <main
          className={`flex-1 flex flex-col overflow-hidden ${
            activeTab === "studio" ? "p-0 h-[calc(100vh-3.5rem)]" : "overflow-y-auto"
          }`}
        >
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
};
