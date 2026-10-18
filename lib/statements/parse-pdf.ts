import "server-only";
import { MAX_PDF_PAGES, MAX_ROWS, StatementError, inspectPdf } from "./validate";
import { detectCurrency, parseAmount, parseDate, type ParseResult, type RawRow } from "./fields";
import { accountHint } from "./normalise";
import type { Currency } from "../types";

/**
 * Reads a text-based PDF statement on the server (pdf.js via unpdf; no OCR, no network).
 * Text items are regrouped into lines by their y position, then each line that starts with a
 * date and ends with one to three amounts becomes a row. When a running balance is printed,
 * the change in balance decides whether the row is money in or out; otherwise wording such as
 * "CR"/"paid in" does, with lower confidence so the row is flagged for review.
 */
export async function extractPdfLines(bytes: Uint8Array): Promise<string[]> {
  inspectPdf(bytes);
  const { getDocumentProxy } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, disableFontFace: true } as never);
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (/password/i.test(name)) throw new StatementError("PDF_ENCRYPTED", "This PDF is password-protected.");
    throw new StatementError("UNREADABLE", "CaiMao couldn't open this PDF.");
  }
  if (pdf.numPages > MAX_PDF_PAGES) throw new StatementError("PDF_TOO_MANY_PAGES", `The PDF has more than ${MAX_PDF_PAGES} pages.`);

  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byLine = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      if (!item.str?.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5] / 2) * 2; // merge items within ~2pt vertically
      const x = item.transform[4];
      byLine.set(y, [...(byLine.get(y) ?? []), { x, s: item.str }]);
    }
    const sorted = [...byLine.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of sorted) lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join("  ").replace(/\s{3,}/g, "  ").trim());
  }
  await pdf.cleanup().catch(() => {});
  return lines;
}

const DATE_START = /^(\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,4}[a-z]*(?:[\s-]\d{2,4})?|[A-Za-z]{3}\s\d{1,2}(?:,?\s\d{4})?)\b/;
const AMOUNT = /\(?[-−]?[£$¥€]?\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})\)?(?:\s?(?:CR|DR))?/gi;

export function parsePdfLines(lines: string[], defaultCurrency: Currency): ParseResult {
  const text = lines.join("\n");
  const currency = detectCurrency(lines.slice(0, 40).join(" ")) ?? defaultCurrency;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const fallbackYear = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();

  const out: (RawRow & { balance: number | null; hinted: boolean })[] = [];
  let skipped = 0;
  for (const line of lines) {
    const dm = line.match(DATE_START);
    if (!dm) continue;
    const date = parseDate(dm[1], "dmy", fallbackYear);
    if (!date) continue;
    const rest = line.slice(dm[0].length).trim();
    const amounts = [...rest.matchAll(AMOUNT)].map((m) => ({ raw: m[0], index: m.index ?? 0 }));
    if (!amounts.length) {
      skipped++;
      continue;
    }
    // Description = text before the first amount column.
    const description = rest.slice(0, amounts[0].index).replace(/\s{2,}/g, " ").trim();
    if (!description || /^(opening|closing|brought forward|carried forward|balance)\b/i.test(description)) continue;

    const values = amounts.map((a) => parseAmount(a.raw));
    if (values.some((v) => v == null)) {
      skipped++;
      continue;
    }
    const amountRaw = amounts[0].raw;
    const amount = values[0]!;
    const balance = values.length >= 2 ? values[values.length - 1] : null;
    const explicitSign = /^\(|[-−]|DR$|CR$/i.test(amountRaw.trim());
    const creditWords = /\b(cr|credit|paid in|deposit|salary|refund|received|transfer from|入金|收入)\b/i.test(line);
    const signed = explicitSign ? amount : creditWords ? Math.abs(amount) : -Math.abs(amount);
    out.push({
      date,
      description: description.slice(0, 300),
      amount: signed,
      currency,
      reference: null,
      extraction_confidence: explicitSign ? 0.9 : 0.65,
      balance,
      hinted: explicitSign,
    });
    if (out.length > MAX_ROWS) throw new StatementError("NO_TRANSACTIONS", `The statement has more than ${MAX_ROWS} rows.`);
  }

  // Use the running balance to confirm money in / money out where it's printed.
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1].balance;
    const cur = out[i].balance;
    if (prev == null || cur == null) continue;
    const delta = Math.round((cur - prev) * 100) / 100;
    if (Math.abs(Math.abs(delta) - Math.abs(out[i].amount)) < 0.01) {
      out[i].amount = delta;
      out[i].extraction_confidence = 0.92;
    }
  }

  if (!out.length) {
    throw new StatementError("NO_TRANSACTIONS", "CaiMao couldn't find transaction lines in this PDF. Scanned statements aren't supported yet; try your bank's CSV export.");
  }
  const warnings = [`pdf_sign_check`];
  if (skipped) warnings.push(`skipped_rows:${skipped}`);
  return {
    rows: out.filter((r) => r.amount !== 0).map(({ balance: _b, hinted: _h, ...r }) => r),
    skipped,
    warnings,
    currency,
    account_hint: accountHint(lines.slice(0, 40).join(" ")),
  };
}
