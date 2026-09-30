/**
 * Privacy-Preserving Telemetry Error Boundary
 * 
 * Intercepts unhandled UI exceptions, strictly scrubs all personal and financial data,
 * captures only whitelisted telemetry codes, and renders a sci-fi HUD recovery view.
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "@boredkevin/ui";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import {
  scrubAndRecordTelemetry,
  TelemetryErrorCode,
  ScrubbedTelemetryEvent,
} from "./telemetryScrubber.js";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  scrubbedEvent: ScrubbedTelemetryEvent | null;
}

export class TelemetryErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    scrubbedEvent: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    const scrubbed = scrubAndRecordTelemetry(error);
    return {
      hasError: true,
      scrubbedEvent: scrubbed,
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Invariant 1: Error details are scrubbed in getDerivedStateFromError.
    // Error stack traces or component trees containing props (amounts, names) are discarded.
    scrubAndRecordTelemetry(error);
  }

  private handleReset = () => {
    this.setState({ hasError: false, scrubbedEvent: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      const code: TelemetryErrorCode =
        this.state.scrubbedEvent?.code || "UNKNOWN_CLIENT_ERROR";

      return (
        <div className="w-full p-6 flex items-center justify-center min-h-[320px]">
          <Card className="w-full max-w-lg border-destructive/40 bg-card/90 backdrop-blur-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="destructive" className="font-mono text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  SYSTEM FAULT
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1"
                >
                  <ShieldCheck className="h-3 w-3" />
                  ZERO DATA EGRESS
                </Badge>
              </div>
              <CardTitle className="text-lg font-bold font-mono tracking-tight mt-2 text-foreground">
                {this.props.fallbackTitle || "Execution Interrupted"}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                A localized client error occurred. All financial figures, credentials, and merchant details were redacted before memory logging.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="p-3 rounded border border-border bg-background/50 font-mono text-xs">
                <div className="text-muted-foreground text-[10px] uppercase">Telemetry Error Code:</div>
                <div className="text-destructive font-semibold mt-0.5">{code}</div>
              </div>
            </CardContent>

            <CardFooter className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleReset}
                className="gap-1.5 font-mono text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset & Retry
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
