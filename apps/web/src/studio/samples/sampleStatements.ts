/**
 * Studio Pre-packaged Sample Statement Documents
 * 
 * Provides verified reference statements matching BCA, CIMB Niaga, and Blu BCA formats
 * for instant interactive testing, visual guide tuning, and math reconciliation.
 */

import { StatementParserConfig } from "../../../../../packages/dsl/schema.js";
import { NormalizedTextSpan } from "../../../../../packages/dsl/types.js";
import { StudioDocument } from "../types.js";

export const BCA_SAMPLE_CONFIG: StatementParserConfig = {
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

export const CIMB_SAMPLE_CONFIG: StatementParserConfig = {
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

export const BLU_SAMPLE_CONFIG: StatementParserConfig = {
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
    dateRegex: "^\\d{4}-\\d{2}-\\d{2}$",
    descriptionJoiner: " ",
  },
  fields: {
    date: { columnId: "date", format: "YYYY-MM-DD" },
    description: { columnIds: ["description"] },
    amountStrategy: {
      columnId: "amount",
      debitIndicator: { pattern: "-", position: "prefix" },
      decimalSep: ".",
      thousandSep: ",",
    },
    balance: { columnId: "balance", optional: false },
  },
};

export const BCA_SAMPLE_SPANS: NormalizedTextSpan[] = [
  // Header Metadata (Zone < topMargin 150)
  { text: "BANK CENTRAL ASIA", x: 40, y: 35, width: 220, height: 16 },
  { text: "REKENING KORAN", x: 400, y: 35, width: 180, height: 18 },
  { text: "NAMA : ALEXANDER MORGAN", x: 40, y: 65, width: 240, height: 12 },
  { text: "NO REKENING : 8820194821", x: 40, y: 85, width: 210, height: 12 },
  { text: "ALAMAT : JL JEND SUDIRMAN NO 45 JAKARTA", x: 40, y: 105, width: 330, height: 12 },
  { text: "PERIODE : 01/10/2024 - 31/10/2024", x: 700, y: 65, width: 240, height: 12 },
  { text: "MATA UANG : IDR", x: 700, y: 85, width: 140, height: 12 },

  // Table Column Header (y = 155)
  { text: "TANGGAL", x: 35, y: 155, width: 70, height: 12 },
  { text: "KETERANGAN", x: 130, y: 155, width: 100, height: 12 },
  { text: "CB", x: 490, y: 155, width: 30, height: 12 },
  { text: "MUTASI", x: 570, y: 155, width: 60, height: 12 },
  { text: "SALDO", x: 800, y: 155, width: 50, height: 12 },

  // Transaction 1: 01/10 Transfer Out (1.500.000,00 DB) -> Balance 18.500.000,00
  { text: "01/10", x: 35, y: 200, width: 45, height: 12 },
  { text: "TRSF E-BANKING DB", x: 130, y: 200, width: 150, height: 12 },
  { text: "0000", x: 490, y: 200, width: 35, height: 12 },
  { text: "1.500.000,00 DB", x: 570, y: 200, width: 120, height: 12 },
  { text: "18.500.000,00", x: 800, y: 200, width: 110, height: 12 },
  // Row 1 continuation line 2
  { text: "TRANSFER KE REK 0987654321", x: 130, y: 216, width: 210, height: 11 },
  // Row 1 continuation line 3
  { text: "BIF DANA DARURAT", x: 130, y: 232, width: 140, height: 11 },

  // Transaction 2: 05/10 Cash Deposit (5.000.000,00 CR) -> Balance 23.500.000,00
  { text: "05/10", x: 35, y: 280, width: 45, height: 12 },
  { text: "SETORAN TUNAI", x: 130, y: 280, width: 120, height: 12 },
  { text: "0123", x: 490, y: 280, width: 35, height: 12 },
  { text: "5.000.000,00", x: 570, y: 280, width: 100, height: 12 },
  { text: "23.500.000,00", x: 800, y: 280, width: 110, height: 12 },
  // Row 2 continuation
  { text: "ATM SETOR TUNAI KCP SUDIRMAN", x: 130, y: 296, width: 230, height: 11 },

  // Transaction 3: 12/10 QRIS Payment (250.000,00 DB) -> Balance 23.250.000,00
  { text: "12/10", x: 35, y: 350, width: 45, height: 12 },
  { text: "QRIS PEMBAYARAN DB", x: 130, y: 350, width: 160, height: 12 },
  { text: "0000", x: 490, y: 350, width: 35, height: 12 },
  { text: "250.000,00 DB", x: 570, y: 350, width: 105, height: 12 },
  { text: "23.250.000,00", x: 800, y: 350, width: 110, height: 12 },
  { text: "KEDAI KOPI NIKMAT QR0981", x: 130, y: 366, width: 195, height: 11 },

  // Transaction 4: 20/10 Admin Fee (15.000,00 DB) -> Balance 23.235.000,00
  { text: "20/10", x: 35, y: 420, width: 45, height: 12 },
  { text: "BIAYA ADM", x: 130, y: 420, width: 90, height: 12 },
  { text: "0000", x: 490, y: 420, width: 35, height: 12 },
  { text: "15.000,00 DB", x: 570, y: 420, width: 95, height: 12 },
  { text: "23.235.000,00", x: 800, y: 420, width: 110, height: 12 },

  // Transaction 5: 31/10 Interest Earned (2.500,00 CR) -> Balance 23.237.500,00
  { text: "31/10", x: 35, y: 480, width: 45, height: 12 },
  { text: "BUNGA", x: 130, y: 480, width: 60, height: 12 },
  { text: "0000", x: 490, y: 480, width: 35, height: 12 },
  { text: "2.500,00", x: 570, y: 480, width: 70, height: 12 },
  { text: "23.237.500,00", x: 800, y: 480, width: 110, height: 12 },

  // Transaction 6: 31/10 Tax on Interest (500,00 DB) -> Balance 23.237.000,00
  { text: "31/10", x: 35, y: 540, width: 45, height: 12 },
  { text: "PAJAK BUNGA", x: 130, y: 540, width: 95, height: 12 },
  { text: "0000", x: 490, y: 540, width: 35, height: 12 },
  { text: "500,00 DB", x: 570, y: 540, width: 80, height: 12 },
  { text: "23.237.000,00", x: 800, y: 540, width: 110, height: 12 },

  // Footer Summary (Zone > bottomMargin 920)
  { text: "SALDO AWAL : 20.000.000,00", x: 40, y: 935, width: 210, height: 12 },
  { text: "MUTASI CR : 5.002.500,00", x: 300, y: 935, width: 190, height: 12 },
  { text: "MUTASI DB : 1.765.500,00", x: 540, y: 935, width: 190, height: 12 },
  { text: "SALDO AKHIR : 23.237.000,00", x: 760, y: 935, width: 200, height: 12 },
];

export const CIMB_SAMPLE_SPANS: NormalizedTextSpan[] = [
  // Header
  { text: "CIMB NIAGA", x: 50, y: 40, width: 180, height: 16 },
  { text: "STATEMENT OF ACCOUNT", x: 400, y: 40, width: 220, height: 16 },
  { text: "TANGGAL TRANSAKSI TANGGAL VALUTA URAIAN TRANSAKSI DEBET KREDIT SALDO", x: 40, y: 150, width: 900, height: 12 },

  // Row 1
  { text: "01/10/2024", x: 40, y: 200, width: 80, height: 12 },
  { text: "01/10/2024", x: 130, y: 200, width: 80, height: 12 },
  { text: "TRANSFER BI-FAST KE BANK MANDIRI", x: 220, y: 200, width: 260, height: 12 },
  { text: "2.000.000,00", x: 530, y: 200, width: 110, height: 12 },
  { text: "", x: 680, y: 200, width: 0, height: 0 },
  { text: "48.000.000,00", x: 840, y: 200, width: 110, height: 12 },

  // Row 2
  { text: "15/10/2024", x: 40, y: 260, width: 80, height: 12 },
  { text: "15/10/2024", x: 130, y: 260, width: 80, height: 12 },
  { text: "SALARY CREDIT PT FINANSIAL UTAMA", x: 220, y: 260, width: 280, height: 12 },
  { text: "", x: 530, y: 260, width: 0, height: 0 },
  { text: "15.000.000,00", x: 680, y: 260, width: 110, height: 12 },
  { text: "63.000.000,00", x: 840, y: 260, width: 110, height: 12 },
];

export const BLU_SAMPLE_CSV_TEXT = `Date,Description,Type,Amount,Balance
2024-10-01,Top up e-Wallet Gopay,DEBIT,-100000.00,4900000.00
2024-10-05,Transfer from BCA Account,CREDIT,2500000.00,7400000.00
2024-10-12,Payment QRIS HokBen,DEBIT,-85000.00,7315000.00
2024-10-25,Cashback promo oct,CREDIT,15000.00,7330000.00
2024-10-31,Interest payment,CREDIT,3500.00,7333500.00`;

/**
 * Creates the default BCA sample document for Parser Studio.
 */
export function createDefaultSampleDocument(): StudioDocument {
  return {
    id: "sample-bca-individual",
    name: "bca-individual-statement-oct2024.pdf",
    fileType: "pdf",
    data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // mock binary PDF header
    totalPages: 1,
    currentPage: 1,
    spansByPage: {
      1: BCA_SAMPLE_SPANS,
    },
    isSample: true,
    uploadedAt: Date.now(),
  };
}

/**
 * Creates sample documents registry.
 */
export const SAMPLE_DOCUMENTS: Record<string, () => StudioDocument> = {
  bca: createDefaultSampleDocument,
  cimb: () => ({
    id: "sample-cimb-niaga",
    name: "cimb-niaga-statement-oct2024.pdf",
    fileType: "pdf",
    data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    totalPages: 1,
    currentPage: 1,
    spansByPage: {
      1: CIMB_SAMPLE_SPANS,
    },
    isSample: true,
    uploadedAt: Date.now(),
  }),
  blu: () => ({
    id: "sample-blu-csv",
    name: "blu-bca-statement-oct2024.csv",
    fileType: "csv",
    data: BLU_SAMPLE_CSV_TEXT,
    totalPages: 1,
    currentPage: 1,
    spansByPage: {},
    csvRows: [
      ["Date", "Description", "Type", "Amount", "Balance"],
      ["2024-10-01", "Top up e-Wallet Gopay", "DEBIT", "-100000.00", "4900000.00"],
      ["2024-10-05", "Transfer from BCA Account", "CREDIT", "2500000.00", "7400000.00"],
      ["2024-10-12", "Payment QRIS HokBen", "DEBIT", "-85000.00", "7315000.00"],
      ["2024-10-25", "Cashback promo oct", "CREDIT", "15000.00", "7330000.00"],
      ["2024-10-31", "Interest payment", "CREDIT", "3500.00", "7333500.00"],
    ],
    isSample: true,
    uploadedAt: Date.now(),
  }),
};
