/**
 * Bundled Reference Parser Configurations
 * 
 * Static definitions for prominent institutions (BCA, CIMB Niaga, Blu BCA)
 * used as Level 3 fallback when no local or remote marketplace parser matches.
 */

import { StatementParserConfig } from "./schema.js";

export const BUNDLED_BCA_CONFIG: StatementParserConfig = {
  meta: {
    bankId: "bca",
    name: "BCA Individual Account Statement",
    fileType: "pdf",
    version: "1.0.0",
  },
  matchers: {
    fileType: "pdf",
    contentPatterns: ["REKENING KORAN", "BCA|BANK CENTRAL ASIA", "TANGGAL"],
  },
  pageBounds: {
    topMargin: 150,
    bottomMargin: 920,
    headerPattern: "TANGGAL\\s+KETERANGAN\\s+CB",
    footerPattern: "SALDO AWAL|MUTASI CR|MUTASI DB",
  },
  columns: [
    { id: "date", name: "Tanggal", xStart: 30, xEnd: 120 },
    { id: "description", name: "Keterangan", xStart: 120, xEnd: 480 },
    { id: "branch", name: "Cabang", xStart: 480, xEnd: 550 },
    { id: "amount", name: "Mutasi", xStart: 550, xEnd: 790 },
    { id: "balance", name: "Saldo", xStart: 790, xEnd: 980 },
  ],
  rowContinuation: {
    dateRequired: true,
    dateRegex: "^\\d{2}/\\d{2}$",
    descriptionJoiner: "\n",
  },
  fields: {
    date: { columnId: "date", format: "DD/MM" },
    description: { columnIds: ["description"], sanitizeRegex: "[\\r\\t]+" },
    amountStrategy: {
      columnId: "amount",
      debitIndicator: { pattern: "DB", position: "suffix" },
      decimalSep: ",",
      thousandSep: ".",
    },
    balance: { columnId: "balance", optional: false },
  },
};

export const BUNDLED_CIMB_CONFIG: StatementParserConfig = {
  meta: {
    bankId: "cimb-niaga",
    name: "CIMB Niaga Account Statement",
    fileType: "pdf",
    version: "1.0.0",
  },
  matchers: {
    fileType: "pdf",
    contentPatterns: ["CIMB NIAGA", "MUTASI REKENING"],
  },
  pageBounds: {
    topMargin: 160,
    bottomMargin: 910,
    headerPattern: "TGL TRANSAKSI\\s+TGL EFEKTIF|TANGGAL\\s+KETERANGAN",
    footerPattern: "TOTAL TRANSAKSI|TOTAL DEBET|SALDO AKHIR",
  },
  columns: [
    { id: "date", name: "Tanggal Transaksi", xStart: 30, xEnd: 120 },
    { id: "valDate", name: "Tanggal Valuta", xStart: 120, xEnd: 210 },
    { id: "description", name: "Uraian Transaksi", xStart: 210, xEnd: 520 },
    { id: "debit", name: "Debet", xStart: 520, xEnd: 670 },
    { id: "credit", name: "Kredit", xStart: 670, xEnd: 830 },
    { id: "balance", name: "Saldo", xStart: 830, xEnd: 970 },
  ],
  rowContinuation: {
    dateRequired: true,
    dateRegex: "^\\d{2}/\\d{2}/\\d{4}$",
    descriptionJoiner: "\n",
  },
  fields: {
    date: { columnId: "date", format: "DD/MM/YYYY" },
    description: { columnIds: ["description"], sanitizeRegex: "[\\r\\t]+" },
    amountStrategy: {
      debitColumnId: "debit",
      creditColumnId: "credit",
      decimalSep: ",",
      thousandSep: ".",
    },
    balance: { columnId: "balance", optional: false },
  },
};

export const BUNDLED_BLU_CONFIG: StatementParserConfig = {
  meta: {
    bankId: "blu-bca",
    name: "blu by BCA Digital CSV Statement",
    fileType: "csv",
    version: "1.0.0",
  },
  matchers: {
    fileType: "csv",
    contentPatterns: ["Tanggal Transaksi", "Nominal"],
  },
  pageBounds: {
    topMargin: 0,
    bottomMargin: 1000,
    headerPattern: "Tanggal Transaksi.*Nominal",
  },
  columns: [
    { id: "date", columnIndex: 0 },
    { id: "description", columnIndex: 1 },
    { id: "type", columnIndex: 2 },
    { id: "amount", columnIndex: 3 },
    { id: "balance", columnIndex: 4 },
  ],
  rowContinuation: {
    dateRequired: true,
    dateRegex: "^\\d{4}-\\d{2}-\\d{2}",
    descriptionJoiner: " ",
  },
  fields: {
    date: { columnId: "date", format: "YYYY-MM-DD" },
    description: { columnIds: ["description"] },
    amountStrategy: {
      columnId: "amount",
      debitIndicator: {
        pattern: "-",
        position: "prefix",
      },
      decimalSep: ".",
      thousandSep: ",",
    },
    balance: { columnId: "balance", optional: false },
  },
};

export const BUNDLED_CONFIGS: StatementParserConfig[] = [
  BUNDLED_BCA_CONFIG,
  BUNDLED_CIMB_CONFIG,
  BUNDLED_BLU_CONFIG,
];
