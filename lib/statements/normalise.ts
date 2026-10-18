/**
 * Privacy and normalisation helpers for statement rows.
 *  - maskIdentifiers: long digit runs (card, account, phone, IBAN-like numbers) are masked before anything is stored.
 *  - normaliseMerchant: "CARD PAYMENT TESCO STORES 2873 LONDON" → "Tesco Stores".
 */

/** Masks runs of 7+ digits (allowing spaces/dashes inside) and IBAN-like tokens, keeping the last 4 digits. */
export function maskIdentifiers(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, (m) => `••••${m.slice(-4)}`)
    .replace(/(?:\d[ -]?){7,}\d/g, (m) => {
      const digits = m.replace(/\D/g, "");
      return `••••${digits.slice(-4)}`;
    })
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email]");
}

const PREFIXES =
  /^(?:(?:card payment|card purchase|contactless|pos|visa|mastercard|debit card|purchase|payment to|payment from|direct debit|dd|so|standing order|fpi|fpo|bgc|bacs|tfr|transfer|faster payment|bill payment|online payment|apple pay|google pay|nets|paywave|eftpos|ach|zelle to|zelle from|check card|recurring)\b[\s:*-]*)+/i;

const NOISE = [
  /\b\d{2}[/.-]\d{2}(?:[/.-]\d{2,4})?\b/g, // embedded dates
  /\b\d{1,2}(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{0,4}\b/gi,
  /••••\d{0,4}/g,
  /#\s?\d+/g,
  /\b(?:store|str|branch|ref|reference|auth|id|txn)\s*[:#]?\s*\w*\d\w*\b/gi,
  /\b\d{3,}\b/g, // store numbers
  /\*+/g,
  /\b(?:gb|gbr|uk|sg|sgp|us|usa|jp|jpn|cn|chn|london|singapore|manchester|new york|tokyo|shanghai|beijing)\b\.?$/i,
];

export function normaliseMerchant(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(PREFIXES, "");
  for (const re of NOISE) s = s.replace(re, " ");
  s = s.replace(/\s{2,}/g, " ").replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "").trim();
  if (!s) return raw.trim().slice(0, 60) || "Unknown";
  // Title-case Latin text only; leave CJK and mixed-case brand names as they are.
  if (/^[\x20-\x7E]+$/.test(s) && (s === s.toUpperCase() || s === s.toLowerCase())) {
    s = s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Ltd|Plc|Inc|Llc)\b/g, (w) => w.toUpperCase().replace("TD", "td").replace("LC", "lc"));
  }
  return s.slice(0, 60);
}

/** Last four digits of an account number seen in the statement header, masked for display. */
export function accountHint(text: string): string | null {
  const m = text.match(/(?:account|acct|a\/c|card|账号|口座)[^\d]{0,20}((?:\d[ -]?){6,}\d)/i);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, "");
  return `••••${digits.slice(-4)}`;
}
