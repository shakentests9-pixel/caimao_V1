import "server-only";
import { randomUUID } from "node:crypto";
import type { Currency, StatementTransaction, StatementUpload } from "../types";
import { classifyDetailed, REVIEW_THRESHOLD } from "../budget/classifier";
import { detectFileType, sanitiseFileName, sha256Hex, StatementError } from "./validate";
import { parseCsvStatement } from "./parse-csv";
import { extractPdfLines, parsePdfLines } from "./parse-pdf";
import { maskIdentifiers, normaliseMerchant } from "./normalise";
import type { ParseResult } from "./fields";

/** Unconfirmed previews are deleted after this long. */
export const PREVIEW_TTL_MS = 60 * 60 * 1000;

export interface ParsedStatement {
  upload: StatementUpload;
  transactions: StatementTransaction[];
}

/**
 * parseBankStatement(): bytes in, structured rows out. The bytes are only held in memory
 * for the duration of this call; nothing here writes the file anywhere.
 */
export async function parseBankStatement(
  bytes: Uint8Array,
  fileName: string,
  opts: { userId: string; defaultCurrency: Currency; now?: Date },
): Promise<ParsedStatement> {
  const now = opts.now ?? new Date();
  const type = detectFileType(bytes, fileName);
  const sha256 = await sha256Hex(bytes);

  let parsed: ParseResult;
  if (type === "csv") {
    const text = new TextDecoder("utf-8").decode(bytes);
    parsed = parseCsvStatement(text, opts.defaultCurrency);
  } else {
    const lines = await extractPdfLines(bytes);
    parsed = parsePdfLines(lines, opts.defaultCurrency);
  }

  const uploadId = randomUUID();
  const transactions = classifyTransactions(parsed, { uploadId, userId: opts.userId });
  if (!transactions.length) throw new StatementError("NO_TRANSACTIONS", "CaiMao couldn't read any transactions from this file.");

  const dates = transactions.map((t) => t.date).sort();
  const upload: StatementUpload = {
    id: uploadId,
    user_id: opts.userId,
    file_name: sanitiseFileName(fileName),
    file_type: type,
    size_bytes: bytes.length,
    sha256,
    status: "PREVIEW",
    currency: parsed.currency ?? opts.defaultCurrency,
    period_start: dates[0] ?? null,
    period_end: dates[dates.length - 1] ?? null,
    account_hint: parsed.account_hint,
    row_count: transactions.length,
    low_confidence_count: transactions.filter((t) => t.needs_review).length,
    warnings: parsed.warnings,
    created_at: now.toISOString(),
    confirmed_at: null,
    expires_at: new Date(now.getTime() + PREVIEW_TTL_MS).toISOString(),
  };
  return { upload, transactions };
}

/**
 * classifyTransactions(): masks identifiers, normalises the merchant, applies the
 * deterministic classifier and combines extraction and classification confidence.
 */
export function classifyTransactions(parsed: ParseResult, ids: { uploadId: string; userId: string }): StatementTransaction[] {
  return parsed.rows.map((row, i) => {
    const description = maskIdentifiers(row.description);
    const c = classifyDetailed(description, description, row.amount);
    const merchant = c.merchant ?? normaliseMerchant(description);
    const confidence = Math.round(Math.min(1, c.confidence * row.extraction_confidence) * 1000) / 1000;
    return {
      id: `${ids.uploadId.slice(0, 8)}-${String(i + 1).padStart(4, "0")}`,
      upload_id: ids.uploadId,
      user_id: ids.userId,
      date: row.date,
      description,
      merchant,
      amount: row.amount,
      currency: row.currency ?? parsed.currency ?? "GBP",
      direction: row.amount < 0 ? "debit" : "credit",
      reference: row.reference ? maskIdentifiers(row.reference).slice(0, 60) : null,
      category: c.category,
      subcategory: c.subcategory,
      confidence,
      category_source: c.source === "merchant" ? "merchant" : c.source === "rule" ? "rule" : "fallback",
      needs_review: confidence < REVIEW_THRESHOLD,
      included: true,
    } satisfies StatementTransaction;
  });
}
