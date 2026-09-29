/**
 * Declarative DSL Schema Specification for Statement Parser Engine
 * 
 * Strict declarative JSON configuration for parsing PDF and CSV statements
 * without executing arbitrary or dynamic code.
 */

import { z } from "zod";

export const FileTypeSchema = z.enum(["pdf", "csv"]);
export type FileType = z.infer<typeof FileTypeSchema>;

export const MetaSchema = z.object({
  bankId: z.string().min(1, "bankId is required"),
  name: z.string().min(1, "name is required"),
  fileType: FileTypeSchema,
  version: z.string().min(1, "version is required"),
});
export type StatementMeta = z.infer<typeof MetaSchema>;

export const MatchersSchema = z.object({
  fileType: FileTypeSchema,
  contentPatterns: z.array(z.string().min(1)).min(1, "At least one contentPattern is required"),
});
export type StatementMatchers = z.infer<typeof MatchersSchema>;

export const PageBoundsSchema = z.object({
  topMargin: z.number().min(0).max(1000),
  bottomMargin: z.number().min(0).max(1000),
  headerPattern: z.string().optional(),
  footerPattern: z.string().optional(),
});
export type PageBounds = z.infer<typeof PageBoundsSchema>;

export const PdfColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  xStart: z.number().min(0).max(1000),
  xEnd: z.number().min(0).max(1000),
});
export type PdfColumn = z.infer<typeof PdfColumnSchema>;

export const CsvColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  columnIndex: z.number().int().min(0),
});
export type CsvColumn = z.infer<typeof CsvColumnSchema>;

export const ColumnItemSchema = z.union([PdfColumnSchema, CsvColumnSchema]);
export type ColumnItem = z.infer<typeof ColumnItemSchema>;

export const ColumnsSchema = z.union([
  z.array(PdfColumnSchema),
  z.array(CsvColumnSchema),
  z.array(ColumnItemSchema),
]);
export type StatementColumns = z.infer<typeof ColumnsSchema>;

export const RowContinuationSchema = z.object({
  dateRequired: z.boolean(),
  dateRegex: z.string().min(1),
  descriptionJoiner: z.enum(["\n", " "]),
});
export type RowContinuation = z.infer<typeof RowContinuationSchema>;

export const DebitIndicatorSchema = z.object({
  pattern: z.string().min(1),
  position: z.enum(["prefix", "suffix"]),
});
export type DebitIndicator = z.infer<typeof DebitIndicatorSchema>;

export const DecimalSepSchema = z.enum([",", "."]);
export const ThousandSepSchema = z.enum([".", ","]);

export const SingleColumnAmountStrategySchema = z.object({
  mode: z.literal("single").optional(),
  columnId: z.string().min(1),
  debitIndicator: DebitIndicatorSchema,
  decimalSep: DecimalSepSchema,
  thousandSep: ThousandSepSchema,
});
export type SingleColumnAmountStrategy = z.infer<typeof SingleColumnAmountStrategySchema>;

export const SplitColumnAmountStrategySchema = z.object({
  mode: z.literal("split").optional(),
  debitColumnId: z.string().min(1),
  creditColumnId: z.string().min(1),
  decimalSep: DecimalSepSchema,
  thousandSep: ThousandSepSchema,
});
export type SplitColumnAmountStrategy = z.infer<typeof SplitColumnAmountStrategySchema>;

export const AmountStrategySchema = z.union([
  SingleColumnAmountStrategySchema,
  SplitColumnAmountStrategySchema,
]);
export type AmountStrategy = z.infer<typeof AmountStrategySchema>;

export const FieldsSchema = z.object({
  date: z.object({
    columnId: z.string().min(1),
    format: z.string().min(1),
  }),
  description: z.object({
    columnIds: z.array(z.string().min(1)).min(1),
    sanitizeRegex: z.string().optional(),
  }),
  amountStrategy: AmountStrategySchema,
  balance: z.object({
    columnId: z.string().min(1),
    optional: z.boolean(),
  }),
});
export type StatementFields = z.infer<typeof FieldsSchema>;

export const StatementParserConfigSchema = z.object({
  meta: MetaSchema,
  matchers: MatchersSchema,
  pageBounds: PageBoundsSchema,
  columns: ColumnsSchema,
  rowContinuation: RowContinuationSchema,
  fields: FieldsSchema,
});

export type StatementParserConfig = z.infer<typeof StatementParserConfigSchema>;

/**
 * Validates a raw JSON configuration against StatementParserConfigSchema.
 * Throws ZodError if invalid.
 */
export function validateStatementParserConfig(config: unknown): StatementParserConfig {
  return StatementParserConfigSchema.parse(config);
}

/**
 * Safe validator returning success boolean and optional error.
 */
export function safeValidateStatementParserConfig(config: unknown): {
  success: boolean;
  data?: StatementParserConfig;
  error?: z.ZodError;
} {
  const result = StatementParserConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
