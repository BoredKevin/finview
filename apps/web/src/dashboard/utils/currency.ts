/**
 * Currency & Minor Units Internationalization Utilities
 * 
 * Supports standard international formats alongside Indonesian conventions:
 * - IDR: "Rp 1.250.000" or "Rp 1.250.000,00"
 * - USD: "$1,250.00"
 * - EUR: "€1.250,00"
 * - SGD: "S$1,250.00"
 * 
 * Invariant: Internal financial values are strictly represented as signed bigint minor units
 * without floating-point inaccuracies.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  decimals: number;
  thousandSep: string;
  decimalSep: string;
  symbolPosition: "prefix" | "suffix";
  spaceAfterSymbol: boolean;
}

export const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
  IDR: {
    code: "IDR",
    symbol: "Rp",
    decimals: 0, // In statements often minor units are 2 decimals or 0. Default display 0 or adaptive
    thousandSep: ".",
    decimalSep: ",",
    symbolPosition: "prefix",
    spaceAfterSymbol: true,
  },
  USD: {
    code: "USD",
    symbol: "$",
    decimals: 2,
    thousandSep: ",",
    decimalSep: ".",
    symbolPosition: "prefix",
    spaceAfterSymbol: false,
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    decimals: 2,
    thousandSep: ".",
    decimalSep: ",",
    symbolPosition: "prefix",
    spaceAfterSymbol: false,
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    decimals: 2,
    thousandSep: ",",
    decimalSep: ".",
    symbolPosition: "prefix",
    spaceAfterSymbol: false,
  },
  SGD: {
    code: "SGD",
    symbol: "S$",
    decimals: 2,
    thousandSep: ",",
    decimalSep: ".",
    symbolPosition: "prefix",
    spaceAfterSymbol: false,
  },
};

/**
 * Format bigint or number minor units into locale-aware currency string.
 * @param amountMinorUnits The signed integer amount in minor units (e.g. cents)
 * @param currency ISO 4217 Currency Code (default: "IDR")
 * @param forceDecimals Optional override for decimal places displayed
 */
export function formatMinorUnits(
  amountMinorUnits: bigint | number,
  currency = "IDR",
  forceDecimals?: number
): string {
  const code = (currency || "IDR").toUpperCase();
  const config = CURRENCY_CONFIGS[code] || {
    code,
    symbol: code,
    decimals: 2,
    thousandSep: ",",
    decimalSep: ".",
    symbolPosition: "prefix",
    spaceAfterSymbol: true,
  };

  const amountBig = BigInt(amountMinorUnits);
  const isNegative = amountBig < 0n;
  const absBig = isNegative ? -amountBig : amountBig;

  // Assume minor units are represented with 2 decimal places (cents)
  // For IDR statements, amounts in raw text often have 2 decimals (e.g. 10.000,00 -> 1000000n)
  const integerPart = absBig / 100n;
  const fractionalPart = Number(absBig % 100n);

  const decimals =
    forceDecimals !== undefined
      ? forceDecimals
      : config.code === "IDR"
      ? fractionalPart > 0 ? 2 : 0
      : config.decimals;

  // Format integer digits with thousand separators
  const intStr = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandSep);

  let formatted = intStr;
  if (decimals > 0) {
    const fracStr = fractionalPart.toString().padStart(2, "0").slice(0, decimals);
    formatted += config.decimalSep + fracStr;
  }

  const space = config.spaceAfterSymbol ? " " : "";
  const currencyFormatted =
    config.symbolPosition === "prefix"
      ? `${config.symbol}${space}${formatted}`
      : `${formatted}${space}${config.symbol}`;

  return isNegative ? `-${currencyFormatted}` : currencyFormatted;
}

/**
 * Parses user input currency string (e.g. "Rp 1.250.000,50" or "$1,250.50")
 * into signed bigint minor units without floating-point inaccuracies.
 */
export function parseCurrencyStringToMinorUnits(
  input: string,
  currency = "IDR"
): bigint {
  if (!input || !input.trim()) return 0n;

  let cleaned = input.trim();
  const isNegative = cleaned.startsWith("-") || cleaned.includes("(") || cleaned.includes("DB");
  cleaned = cleaned.replace(/[-()+DB\s]/g, "");

  // Remove currency symbol if present
  const code = currency.toUpperCase();
  const config = CURRENCY_CONFIGS[code];
  if (config) {
    cleaned = cleaned.replace(config.symbol, "").trim();
  }

  // Determine decimal and thousand separators
  // If input contains both '.' and ',', the last one is the decimal separator
  let decimalSep = ".";
  let thousandSep = ",";

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      decimalSep = ",";
      thousandSep = ".";
    } else {
      decimalSep = ".";
      thousandSep = ",";
    }
  } else if (lastComma !== -1) {
    // Only comma present
    if (code === "IDR" || code === "EUR") {
      decimalSep = ",";
      thousandSep = ".";
    } else {
      // Check if comma has 2 digits after it
      const parts = cleaned.split(",");
      if (parts.length === 2 && parts[1].length <= 2) {
        decimalSep = ",";
      } else {
        thousandSep = ",";
        decimalSep = ".";
      }
    }
  } else if (lastDot !== -1) {
    // Only dot present
    if (code === "IDR") {
      const parts = cleaned.split(".");
      // If dot has 3 digits after it, it's almost certainly a thousand separator in Indonesia
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        thousandSep = ".";
        decimalSep = ",";
      }
    }
  }

  // Remove thousand separators
  const parts = cleaned.split(decimalSep);
  const intRaw = parts[0].replace(new RegExp(`\\${thousandSep}`, "g"), "").replace(/\D/g, "");
  const fracRaw = parts[1] ? parts[1].replace(/\D/g, "") : "0";

  const intBig = BigInt(intRaw || "0");
  const fracNum = Number((fracRaw + "00").slice(0, 2));

  const totalMinor = intBig * 100n + BigInt(fracNum);
  return isNegative ? -totalMinor : totalMinor;
}
