import { CURRENCIES, type Currency } from "../types";

/** One extracted row before classification. */
export interface RawRow {
  date: string; // ISO yyyy-mm-dd
  description: string;
  amount: number; // negative = money out
  currency: Currency | null;
  reference: string | null;
  /** How sure the parser is that date, amount and sign were read correctly (0–1). */
  extraction_confidence: number;
}

export interface ParseResult {
  rows: RawRow[];
  skipped: number;
  warnings: string[];
  currency: Currency | null;
  account_hint: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export type DateOrder = "dmy" | "mdy" | "ymd";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/**
 * Looks at all date strings in a column to decide day/month order: any first part > 12 means
 * day-first, any second part > 12 means month-first. Ambiguous columns default to day-first.
 */
export function inferDateOrder(samples: string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const m = s.trim().match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/);
    if (!m) continue;
    if (m[1].length === 4) return "ymd";
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) dmy++;
    if (b > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/** Parses the common statement date formats into ISO. `fallbackYear` fills "12 Mar" style dates. */
export function parseDate(raw: string, order: DateOrder = "dmy", fallbackYear?: number): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[/.-年](\d{1,2})[/.-月](\d{1,2})日?/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return order === "mdy" ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s,-]*(\d{2,4})?\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3] ? +m[3] : fallbackYear;
    return y ? iso(y, MONTHS[m[2].toLowerCase()], +m[1]) : null;
  }
  m = s.match(/^([A-Za-z]{3,4})[a-z]*[\s-](\d{1,2}),?\s*(\d{2,4})?\b/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const y = m[3] ? +m[3] : fallbackYear;
    return y ? iso(y, MONTHS[m[1].toLowerCase()], +m[2]) : null;
  }
  return null;
}

const CURRENCY_SYMBOLS: [RegExp, Currency][] = [
  [/S\$|SGD/i, "SGD"],
  [/HK\$|HKD/i, "HKD"],
  [/US\$|USD/i, "USD"],
  [/£|GBP/i, "GBP"],
  [/RMB|CNY|元/i, "CNY"],
  [/JPY|円/i, "JPY"],
  [/VND|₫/i, "VND"],
];

export function detectCurrency(text: string): Currency | null {
  const code = text.toUpperCase().match(/\b(USD|GBP|SGD|CNY|HKD|VND|JPY)\b/);
  if (code && (CURRENCIES as readonly string[]).includes(code[1])) return code[1] as Currency;
  for (const [re, c] of CURRENCY_SYMBOLS) if (re.test(text)) return c;
  if (/¥|￥/.test(text)) return null; // ambiguous between CNY and JPY
  return null;
}

/**
 * Parses "1,234.56", "-12.00", "(12.00)", "12.00 DR", "£1,000", "1.234,56" (comma decimal).
 * Returns null when the cell isn't a number.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s || s === "-" || s === "—") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\b(dr|debit)\.?$/i.test(s)) {
    negative = true;
    s = s.replace(/\b(dr|debit)\.?$/i, "");
  }
  s = s.replace(/\b(cr|credit)\.?$/i, "");
  if (s.includes("-")) {
    if (/^\s*[-−]/.test(s) || /[-−]\s*$/.test(s)) negative = true;
    s = s.replace(/[-−]/g, "");
  }
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  // Comma as the decimal separator: "1.234,56" or "12,50".
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
