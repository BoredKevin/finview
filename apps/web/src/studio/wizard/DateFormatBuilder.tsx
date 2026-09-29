/**
 * DateFormatBuilder Component
 * 
 * Date format selector with real-time preview against document rows.
 */

import React, { useState } from "react";
import { Button, Input, Badge, Card, CardHeader, CardTitle, CardContent } from "@boredkevin/ui";
import { normalizeDate } from "../../../../../packages/dsl/engine.js";
import { CheckCircle2, AlertTriangle } from "lucide-react";

interface DateFormatBuilderProps {
  format: string;
  sampleDates: string[];
  onChange: (newFormat: string) => void;
}

const COMMON_FORMATS = [
  { value: "DD/MM", label: "DD/MM (e.g. 01/10 - BCA Individual)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (e.g. 01/10/2024 - CIMB Niaga)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (e.g. 2024-10-01 - Blu BCA)" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY (e.g. 01-10-2024)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (e.g. 10/01/2024 - US Format)" },
];

export const DateFormatBuilder: React.FC<DateFormatBuilderProps> = ({
  format,
  sampleDates,
  onChange,
}) => {
  const [customFormat, setCustomFormat] = useState(
    COMMON_FORMATS.some((f) => f.value === format) ? "" : format
  );
  const [testDateInput, setTestDateInput] = useState("01/10");

  const isCustom = !COMMON_FORMATS.some((f) => f.value === format);

  const datesToPreview = sampleDates.length > 0 ? sampleDates.slice(0, 5) : [testDateInput];

  return (
    <Card className="border-border bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-wider uppercase text-foreground">
          Date Format Builder & Row Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground block">
            Select Canonical Format
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COMMON_FORMATS.map((preset) => (
              <Button
                key={preset.value}
                variant={format === preset.value ? "cyber" : "outline"}
                size="sm"
                onClick={() => {
                  onChange(preset.value);
                  setCustomFormat("");
                }}
                className="justify-start font-mono text-xs h-8"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom format option */}
        <div className="pt-2 border-t border-border/60">
          <label className="text-xs font-mono text-muted-foreground block mb-1">
            Or Define Custom Date Pattern
          </label>
          <div className="flex gap-2">
            <Input
              value={customFormat}
              onChange={(e) => {
                setCustomFormat(e.target.value);
                if (e.target.value.trim()) {
                  onChange(e.target.value.trim());
                }
              }}
              placeholder="e.g. DD MMM YYYY"
              className="h-8 font-mono text-xs"
            />
            {isCustom && (
              <Badge variant="outline" className="font-mono text-xs py-0">
                ACTIVE CUSTOM
              </Badge>
            )}
          </div>
        </div>

        {/* Live Preview Against Extracted Statement Rows */}
        <div className="pt-3 border-t border-border/60 bg-muted/20 p-3 space-y-2">
          <div className="text-[11px] font-mono text-muted-foreground flex items-center justify-between">
            <span>REAL-TIME DATE PARSING EVALUATION</span>
            <span className="text-[10px]">FORMAT: {format}</span>
          </div>

          <div className="space-y-1.5">
            {datesToPreview.map((raw, idx) => {
              const normalized = normalizeDate(raw, format);
              const isValid = /^\d{4}-\d{2}-\d{2}$/.test(normalized);

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-1.5 bg-background border border-border/70 text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Raw:</span>
                    <span className="text-foreground font-semibold">"{raw}"</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">→</span>
                    {isValid ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {normalized}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        MALFORMED ({normalized || "empty"})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
