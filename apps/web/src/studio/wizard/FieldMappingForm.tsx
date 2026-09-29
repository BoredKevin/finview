/**
 * FieldMappingForm Component
 * 
 * Form controls to assign canonical targets (Date, Description, Balance, etc.)
 * to detected visual columns.
 */

import React from "react";
import { Input, Switch, Card, CardHeader, CardTitle, CardContent } from "@boredkevin/ui";
import { StatementFields } from "../../../../../packages/dsl/schema.js";
import { VisualColumn } from "../types.js";

interface FieldMappingFormProps {
  fields: StatementFields;
  columns: VisualColumn[];
  onChange: (fields: StatementFields) => void;
}

export const FieldMappingForm: React.FC<FieldMappingFormProps> = ({
  fields,
  columns,
  onChange,
}) => {
  return (
    <Card className="border-border bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-wider uppercase text-foreground">
          Canonical Field Mapping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Field Mapping */}
        <div className="grid grid-cols-2 gap-3 items-center">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">
              Date Target Column
            </label>
            <select
              value={fields.date.columnId}
              onChange={(e) =>
                onChange({
                  ...fields,
                  date: { ...fields.date, columnId: e.target.value },
                })
              }
              className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">
              Date Format
            </label>
            <Input
              value={fields.date.format}
              onChange={(e) =>
                onChange({
                  ...fields,
                  date: { ...fields.date, format: e.target.value },
                })
              }
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>

        {/* Description Field Mapping */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <label className="text-xs font-mono text-muted-foreground block">
            Description Source Columns
          </label>
          <div className="flex flex-wrap gap-2">
            {columns.map((c) => {
              const isSelected = fields.description.columnIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    let nextIds: string[];
                    if (isSelected) {
                      nextIds = fields.description.columnIds.filter((id: string) => id !== c.id);
                      if (nextIds.length === 0) nextIds = [c.id]; // keep at least 1
                    } else {
                      nextIds = [...fields.description.columnIds, c.id];
                    }
                    onChange({
                      ...fields,
                      description: { ...fields.description, columnIds: nextIds },
                    });
                  }}
                  className={`px-2 py-1 text-xs font-mono border transition-colors ${
                    isSelected
                      ? "bg-primary/20 border-primary text-primary font-bold"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c.name} {isSelected && "✓"}
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            <label className="text-xs font-mono text-muted-foreground block mb-1">
              Description Sanitize Regex Pattern
            </label>
            <Input
              value={fields.description.sanitizeRegex || ""}
              onChange={(e) =>
                onChange({
                  ...fields,
                  description: {
                    ...fields.description,
                    sanitizeRegex: e.target.value || undefined,
                  },
                })
              }
              placeholder="e.g. [\\r\\t]+"
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>

        {/* Balance Field Mapping */}
        <div className="grid grid-cols-2 gap-3 items-center pt-2 border-t border-border/60">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">
              Balance Target Column
            </label>
            <select
              value={fields.balance.columnId}
              onChange={(e) =>
                onChange({
                  ...fields,
                  balance: { ...fields.balance, columnId: e.target.value },
                })
              }
              className="w-full bg-background border border-border text-foreground font-mono text-xs rounded-none h-8 px-2 focus:ring-1 focus:ring-primary focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-4">
            <label className="text-xs font-mono text-muted-foreground">
              Balance Optional
            </label>
            <Switch
              checked={fields.balance.optional}
              onCheckedChange={(checked) =>
                onChange({
                  ...fields,
                  balance: { ...fields.balance, optional: checked },
                })
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
