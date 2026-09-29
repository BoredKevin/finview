/**
 * ConfigWizard Component
 * 
 * Visual configuration wizard providing multi-section form controls for
 * metadata, column bounds, canonical field mappings, debit/credit rules, and date formats.
 */

import React, { useState } from "react";
import { Button, Input, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Card, CardHeader, CardTitle, CardContent } from "@boredkevin/ui";
import {
  StatementParserConfig,
  safeValidateStatementParserConfig,
  PdfColumn,
} from "../../../../../packages/dsl/schema.js";
import { VisualColumn } from "../types.js";
import { DebitCreditRuleBuilder } from "./DebitCreditRuleBuilder.js";
import { DateFormatBuilder } from "./DateFormatBuilder.js";
import { FieldMappingForm } from "./FieldMappingForm.js";
import { RowContinuationForm } from "./RowContinuationForm.js";
import { Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";

interface ConfigWizardProps {
  config: StatementParserConfig;
  visualColumns: VisualColumn[];
  sampleDates: string[];
  selectedColumnId: string | null;
  onSelectColumn: (colId: string | null) => void;
  onHoverColumn: (colId: string | null) => void;
  onChange: (updatedConfig: StatementParserConfig) => void;
}

export const ConfigWizard: React.FC<ConfigWizardProps> = ({
  config,
  visualColumns,
  sampleDates,
  selectedColumnId,
  onSelectColumn,
  onHoverColumn,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<"fields" | "amounts" | "dates" | "meta">("fields");

  // Validate current config
  const validation = safeValidateStatementParserConfig(config);

  const handleAddColumn = () => {
    const newId = `col_${Date.now().toString().slice(-4)}`;
    const newCol: PdfColumn = {
      id: newId,
      name: "New Column",
      xStart: 500,
      xEnd: 650,
    };
    onChange({
      ...config,
      columns: [...(config.columns as any[]), newCol],
    });
    onSelectColumn(newId);
  };

  const handleRemoveColumn = (colId: string) => {
    if (config.columns.length <= 1) return;
    onChange({
      ...config,
      columns: (config.columns as any[]).filter((c) => c.id !== colId),
    });
    if (selectedColumnId === colId) {
      onSelectColumn(null);
    }
  };

  const handleUpdateColumnName = (colId: string, name: string) => {
    onChange({
      ...config,
      columns: (config.columns as any[]).map((c) =>
        c.id === colId ? { ...c, name } : c
      ),
    });
  };

  return (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-md overflow-hidden">
      {/* Wizard Header with Validation Status */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-mono font-bold tracking-wider uppercase text-foreground">
            Visual Configuration Wizard
          </h2>
          <div className="text-[11px] font-mono text-muted-foreground">
            Declarative DSL Model for <span className="text-primary">{config.meta.name}</span>
          </div>
        </div>
        <div>
          {validation.success ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-mono text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" />
              DSL VALID
            </Badge>
          ) : (
            <Badge variant="destructive" className="font-mono text-[10px] gap-1">
              <AlertCircle className="h-3 w-3" />
              DSL ERRORS
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 pt-2 border-b border-border bg-background/50">
          <TabsList className="grid grid-cols-4 h-8 bg-muted/40 p-0.5">
            <TabsTrigger value="fields" className="font-mono text-[11px] h-7">
              Fields
            </TabsTrigger>
            <TabsTrigger value="amounts" className="font-mono text-[11px] h-7">
              Amounts
            </TabsTrigger>
            <TabsTrigger value="dates" className="font-mono text-[11px] h-7">
              Dates
            </TabsTrigger>
            <TabsTrigger value="meta" className="font-mono text-[11px] h-7">
              Meta
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Fields & Column Bounds */}
        <TabsContent value="fields" className="flex-1 overflow-y-auto p-3 space-y-4 m-0">
          {/* Visual Column List */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-mono uppercase text-muted-foreground">
                  Detected Visual Columns ({visualColumns.length})
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddColumn}
                  className="h-6 px-2 text-[10px] font-mono gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Column
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {visualColumns.map((col) => {
                const isSelected = selectedColumnId === col.id;
                return (
                  <div
                    key={col.id}
                    onMouseEnter={() => onHoverColumn(col.id)}
                    onMouseLeave={() => onHoverColumn(null)}
                    onClick={() => onSelectColumn(col.id)}
                    className={`flex items-center gap-2 p-2 border transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border/60 bg-background/60 hover:bg-muted/40"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: col.color }}
                    />
                    <Input
                      value={col.name}
                      onChange={(e) => handleUpdateColumnName(col.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 text-xs font-mono bg-transparent border-0 px-1 focus:ring-0"
                    />
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      [{col.xStart} - {col.xEnd}]
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveColumn(col.id);
                      }}
                      disabled={visualColumns.length <= 1}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0 ml-auto"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Canonical Field Mapping */}
          <FieldMappingForm
            fields={config.fields}
            columns={visualColumns}
            onChange={(fields) => onChange({ ...config, fields })}
          />
        </TabsContent>

        {/* Tab 2: Amount & Signs Strategy */}
        <TabsContent value="amounts" className="flex-1 overflow-y-auto p-3 space-y-4 m-0">
          <DebitCreditRuleBuilder
            columns={visualColumns}
            strategy={config.fields.amountStrategy}
            onChange={(strategy) =>
              onChange({
                ...config,
                fields: {
                  ...config.fields,
                  amountStrategy: strategy,
                },
              })
            }
          />
        </TabsContent>

        {/* Tab 3: Dates & Continuation */}
        <TabsContent value="dates" className="flex-1 overflow-y-auto p-3 space-y-4 m-0">
          <DateFormatBuilder
            format={config.fields.date.format}
            sampleDates={sampleDates}
            onChange={(format) =>
              onChange({
                ...config,
                fields: {
                  ...config.fields,
                  date: { ...config.fields.date, format },
                },
              })
            }
          />

          <RowContinuationForm
            rowContinuation={config.rowContinuation}
            onChange={(rowContinuation) =>
              onChange({
                ...config,
                rowContinuation,
              })
            }
          />
        </TabsContent>

        {/* Tab 4: Metadata & Matchers */}
        <TabsContent value="meta" className="flex-1 overflow-y-auto p-3 space-y-4 m-0">
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-foreground">
                Bank Metadata & Identification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-muted-foreground block mb-1">
                    Bank ID (slug)
                  </label>
                  <Input
                    value={config.meta.bankId}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        meta: { ...config.meta, bankId: e.target.value },
                      })
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground block mb-1">
                    Config Version
                  </label>
                  <Input
                    value={config.meta.version}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        meta: { ...config.meta, version: e.target.value },
                      })
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Parser Display Name
                </label>
                <Input
                  value={config.meta.name}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      meta: { ...config.meta, name: e.target.value },
                    })
                  }
                  className="h-8 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1">
                  Content Matcher Patterns (Comma-separated)
                </label>
                <Input
                  value={config.matchers?.contentPatterns?.join(", ") || ""}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      matchers: {
                        ...config.matchers,
                        contentPatterns: e.target.value
                          .split(",")
                          .map((p) => p.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  placeholder="e.g. REKENING KORAN, BCA, TANGGAL"
                  className="h-8 font-mono text-xs"
                />
                <span className="text-[10px] font-mono text-muted-foreground">
                  Phrases that must appear in the document for this parser to automatically activate.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
