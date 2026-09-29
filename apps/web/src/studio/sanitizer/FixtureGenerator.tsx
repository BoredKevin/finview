/**
 * FixtureGenerator Component
 * 
 * Interactive PII Redaction workspace & shareable fixture generator.
 * Produces verified JSON bundle: { config, fixture, signature }
 * confirming character-count, bounding-box geometry, and balance integrity parity.
 */

import React, { useState, useMemo } from "react";
import { Button, Input, Switch, Slider, Badge, Card, CardHeader, CardTitle, CardContent } from "@boredkevin/ui";
import { StatementParserConfig } from "../../../../../packages/dsl/schema.js";
import { StatementParseResult } from "../../../../../packages/dsl/types.js";
import { StudioDocument, SanitizationRuleConfig, StudioExportBundle } from "../types.js";
import {
  DEFAULT_PRESERVED_TOKENS,
  sanitizeNormalizedSpans,
  applyProportionalScalar,
  verifySanitizationParity,
  createStudioExportBundle,
} from "./RedactionEngine.js";
import { formatMinorUnits } from "../reconciliation/ReconciliationEngine.js";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Download,
  Copy,
  Check,
  FileCode,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";

interface FixtureGeneratorProps {
  document: StudioDocument;
  config: StatementParserConfig;
  parseResult: StatementParseResult | null;
}

export const FixtureGenerator: React.FC<FixtureGeneratorProps> = ({
  document,
  config,
  parseResult,
}) => {
  const [rules, setRules] = useState<SanitizationRuleConfig>({
    maskAccountNumbers: true,
    anonymizeCustomerNames: true,
    obfuscateNarratives: true,
    amountScalar: 1.0,
    preserveStructuralTokens: DEFAULT_PRESERVED_TOKENS,
  });

  const [copied, setCopied] = useState(false);
  const [exportBundle, setExportBundle] = useState<StudioExportBundle | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const transactions = parseResult?.transactions || [];
  const rawSpans = document.spansByPage[document.currentPage] || [];

  // Generate sanitized data
  const { sanitizedSpans, sanitizedResult, parity } = useMemo(() => {
    // 1. Sanitize text spans
    const sSpans = sanitizeNormalizedSpans(
      rawSpans,
      rules,
      config.pageBounds.topMargin,
      config.pageBounds.bottomMargin
    );

    // 2. Apply proportional amount scalar and regenerate running balances
    const sResult = applyProportionalScalar(transactions, rules.amountScalar);

    // 3. Verify sanitization parity
    const pReport = verifySanitizationParity(rawSpans, sSpans, {
      openingBalanceMinorUnits: sResult.openingBalanceMinorUnits,
      totalCreditsMinorUnits: sResult.totalCreditsMinorUnits,
      totalDebitsMinorUnits: sResult.totalDebitsMinorUnits,
      closingBalanceMinorUnits: sResult.closingBalanceMinorUnits,
    });

    return {
      sanitizedSpans: sSpans,
      sanitizedResult: sResult,
      parity: pReport,
    };
  }, [rawSpans, transactions, rules, config.pageBounds]);

  // Generate Export Bundle
  const handleGenerateBundle = async () => {
    setIsGenerating(true);
    try {
      const bundle = await createStudioExportBundle(config, {
        bankId: config.meta.bankId,
        bankName: config.meta.name,
        fileType: config.meta.fileType,
        totalPages: document.totalPages,
        totalTransactions: sanitizedResult.sanitizedTransactions.length,
        anonymizedTextSpans: sanitizedSpans,
        sanitizedTransactions: sanitizedResult.sanitizedTransactions,
        reconciliation: {
          openingBalanceMinorUnits: sanitizedResult.openingBalanceMinorUnits.toString(),
          totalCreditsMinorUnits: sanitizedResult.totalCreditsMinorUnits.toString(),
          totalDebitsMinorUnits: sanitizedResult.totalDebitsMinorUnits.toString(),
          closingBalanceMinorUnits: sanitizedResult.closingBalanceMinorUnits.toString(),
          isBalanced: parity.mathematicalParityPreserved,
        },
        parityVerification: parity,
      });
      setExportBundle(bundle);
    } finally {
      setIsGenerating(false);
    }
  };

  // Download Bundle JSON file
  const handleDownloadJson = () => {
    if (!exportBundle) return;
    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${config.meta.bankId}-parser-bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy JSON to clipboard
  const handleCopyJson = async () => {
    if (!exportBundle) return;
    await navigator.clipboard.writeText(JSON.stringify(exportBundle, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-md overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div>
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            PII Redaction & Sanitized Fixture Generator
          </h2>
          <div className="text-[11px] font-mono text-muted-foreground">
            Alters sensitive values while strictly retaining character counts, bounding-box geometry, and math balance.
          </div>
        </div>

        <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-mono text-xs gap-1 py-0.5">
          <Sparkles className="h-3.5 w-3.5" />
          SANITIZATION PARITY
        </Badge>
      </div>

      {/* Redaction Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Toggle Controls */}
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-mono uppercase text-muted-foreground">
              Redaction Rules Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Mask Account Numbers */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-foreground font-semibold">
                  Mask Account & IBAN Numbers
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  Replaces digit sequences with randomized numbers of identical length.
                </div>
              </div>
              <Switch
                checked={rules.maskAccountNumbers}
                onCheckedChange={(checked) =>
                  setRules({ ...rules, maskAccountNumbers: checked })
                }
              />
            </div>

            {/* Anonymize Customer Names */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div>
                <div className="text-xs font-mono text-foreground font-semibold">
                  Anonymize Customer Metadata
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  Substitutes customer names and addresses in document headers.
                </div>
              </div>
              <Switch
                checked={rules.anonymizeCustomerNames}
                onCheckedChange={(checked) =>
                  setRules({ ...rules, anonymizeCustomerNames: checked })
                }
              />
            </div>

            {/* Obfuscate Narrative Remarks */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div>
                <div className="text-xs font-mono text-foreground font-semibold">
                  Obfuscate Transaction Narratives
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  Scrambles counterparty text while preserving structural markers (TRANSFER, DB, CR, BIF).
                </div>
              </div>
              <Switch
                checked={rules.obfuscateNarratives}
                onCheckedChange={(checked) =>
                  setRules({ ...rules, obfuscateNarratives: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Proportional Amount Scalar */}
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-mono uppercase text-muted-foreground">
              Proportional Amount Scalar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <span className="text-muted-foreground">Amount Scalar Multiplier:</span>
                <span className="text-primary font-bold">{rules.amountScalar.toFixed(2)}x</span>
              </div>
              <Slider
                value={[rules.amountScalar]}
                min={0.25}
                max={3.0}
                step={0.05}
                onValueChange={([val]) =>
                  setRules({ ...rules, amountScalar: val ?? 1.0 })
                }
              />
              <div className="text-[10px] font-mono text-muted-foreground mt-2">
                Scales opening balance, all debits, credits, and closing balance proportionally.
                The equation <code className="text-foreground">Opening + Credits - Debits == Closing</code> is mathematically guaranteed to balance to the cent.
              </div>
            </div>

            {/* Scaled Equation Preview */}
            <div className="p-2 border border-border/60 bg-background/60 text-xs font-mono space-y-1">
              <div className="text-[10px] text-muted-foreground">Scaled Balance Equation:</div>
              <div className="text-[11px] font-bold text-foreground">
                {formatMinorUnits(sanitizedResult.openingBalanceMinorUnits)} +{" "}
                {formatMinorUnits(sanitizedResult.totalCreditsMinorUnits)} -{" "}
                {formatMinorUnits(sanitizedResult.totalDebitsMinorUnits)} =={" "}
                <span className="text-emerald-400">
                  {formatMinorUnits(sanitizedResult.closingBalanceMinorUnits)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Parity Verification Report Card */}
      <Card className="border-border bg-card/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Sanitization Parity Verification Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Character Count */}
            <div className="p-2.5 border border-border/60 bg-background/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground">Character Count Parity</div>
                <div className="text-xs font-mono font-bold text-foreground">100% Byte Preserved</div>
              </div>
              {parity.characterCountPreserved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              )}
            </div>

            {/* 2. Bounding Box Geometry */}
            <div className="p-2.5 border border-border/60 bg-background/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground">Geometry Parity</div>
                <div className="text-xs font-mono font-bold text-foreground">0..1000 Grid Unchanged</div>
              </div>
              {parity.geometryPreserved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              )}
            </div>

            {/* 3. Mathematical Balance */}
            <div className="p-2.5 border border-border/60 bg-background/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground">Mathematical Parity</div>
                <div className="text-xs font-mono font-bold text-emerald-400">Zero Discrepancy</div>
              </div>
              {parity.mathematicalParityPreserved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Bundle Actions */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border">
        <Button
          variant="cyber"
          onClick={handleGenerateBundle}
          disabled={isGenerating}
          className="font-mono text-xs gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isGenerating ? "Synthesizing Bundle..." : "Generate Verified Export Bundle"}
        </Button>

        {exportBundle && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyJson}
              className="font-mono text-xs gap-1"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy JSON"}
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleDownloadJson}
              className="font-mono text-xs gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              Download .json
            </Button>
          </div>
        )}
      </div>

      {/* Bundle Signature and Preview */}
      {exportBundle && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-mono uppercase text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified Bundle Ready
              </CardTitle>
              <span className="text-[10px] font-mono text-muted-foreground">
                SHA-256 Signature: {exportBundle.signature.slice(0, 16)}…
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="p-3 bg-black/70 border border-border/60 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-48">
              {JSON.stringify(exportBundle, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
