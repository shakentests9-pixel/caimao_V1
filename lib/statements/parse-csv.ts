import { MAX_ROWS, StatementError } from "./validate";
import { detectCurrency, inferDateOrder, parseAmount, parseDate, type ParseResult, type RawRow } from "./fields";
import { accountHint } from "./normalise";
import type { Currency } from "../types";

/** RFC 4180 CSV reader (quoted fields, escaped quotes, CRLF), with delimiter detection. */
export function readCsv(text: string): string[][] {
  const firstLines = text.split(/\r?\n/).slice(0, 10).join("\n");
  const delims = [",", ";", "\t", "|"];
  const delim = delims.map((d) => ({ d, n: firstLines.split(d).length })).sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length > MAX_ROWS + 50) break;
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

const H = {
  date: /^(transaction date|date|posting date|posted date|value date|txn date|trans\.? date|completed date|日期|交易日期|记账日期|取引日|日付|お取引日)$/i,
  description: /^(description|details|transaction details|narrative|merchant|payee|memo|transaction|name|particulars|reference description|摘要|交易描述|交易摘要|对方户名|内容|お取引内容|取引内容)$/i,
  amount: /^(amount|value|transaction amount|amount \(.*\)|金额|交易金额|金額|取引金額)$/i,
  debit: /^(debit|debits|paid out|money out|withdrawal|withdrawals|out|debit amount|支出|支出金额|出金|お引出し|お支払金額)$/i,
  credit: /^(credit|credits|paid in|money in|deposit|deposits|in|credit amount|收入|收入金额|入金|お預入れ|お預り金額)$/i,
  currency: /^(currency|ccy|币种|貨幣|通貨)$/i,
  reference: /^(reference|ref|ref\.|transaction id|txn id|参考号|流水号|備考)$/i,
  type: /^(type|dr\/cr|debit\/credit|transaction type|收支|入出金区分)$/i,
};

type Col = keyof typeof H;

function mapHeader(cells: string[]) {
  const idx: Partial<Record<Col, number>> = {};
  cells.forEach((cell, i) => {
    const c = cell.replace(/^﻿/, "").trim();
    for (const k of Object.keys(H) as Col[]) if (idx[k] == null && H[k].test(c)) idx[k] = i;
  });
  return idx;
}

/**
 * Turns a bank CSV export into raw rows. Finds the header row (banks often put account details
 * above it), maps columns by name in English, Chinese or Japanese, and supports either one signed
 * amount column or separate money-in / money-out columns.
 */
export function parseCsvStatement(text: string, defaultCurrency: Currency): ParseResult {
  const rows = readCsv(text.replace(/^﻿/, ""));
  if (!rows.length) throw new StatementError("NO_TRANSACTIONS", "The file has no rows.");

  let headerAt = -1;
  let cols: ReturnType<typeof mapHeader> = {};
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const m = mapHeader(rows[i]);
    if (m.date != null && (m.amount != null || m.debit != null || m.credit != null)) {
      headerAt = i;
      cols = m;
      break;
    }
  }
  if (headerAt < 0) {
    throw new StatementError("NO_TRANSACTIONS", "CaiMao couldn't find a header with a date and an amount column.");
  }

  const preamble = rows.slice(0, headerAt).map((r) => r.join(" ")).join("\n");
  const body = rows.slice(headerAt + 1);
  if (body.length > MAX_ROWS) throw new StatementError("NO_TRANSACTIONS", `The statement has more than ${MAX_ROWS} rows.`);

  const order = inferDateOrder(body.map((r) => r[cols.date!] ?? ""));
  const warnings: string[] = [];
  const headerCurrency = detectCurrency(rows[headerAt].join(" ")) ?? detectCurrency(preamble);
  const out: RawRow[] = [];
  let skipped = 0;

  for (const r of body) {
    const date = parseDate(r[cols.date!] ?? "", order);
    let amount: number | null = null;
    let confidence = 0.98;

    if (cols.amount != null) {
      amount = parseAmount(r[cols.amount] ?? "");
      const type = cols.type != null ? (r[cols.type] ?? "").toLowerCase() : "";
      if (amount != null && type) {
        if (/^(dr|debit|d|支出|出金)/.test(type)) amount = -Math.abs(amount);
        else if (/^(cr|credit|c|收入|入金)/.test(type)) amount = Math.abs(amount);
      }
    } else {
      const out_ = cols.debit != null ? parseAmount(r[cols.debit] ?? "") : null;
      const in_ = cols.credit != null ? parseAmount(r[cols.credit] ?? "") : null;
      if (out_ != null || in_ != null) amount = Math.abs(in_ ?? 0) - Math.abs(out_ ?? 0);
    }

    const descParts = [cols.description != null ? r[cols.description] : ""].filter(Boolean);
    if (!descParts.length) {
      // No description column: use the remaining text cells.
      descParts.push(
        r.filter((_, i) => ![cols.date, cols.amount, cols.debit, cols.credit, cols.currency, cols.reference, cols.type].includes(i) && !/^[\d\s.,()-]*$/.test(r[i])).join(" "),
      );
      confidence = 0.8;
    }
    const description = descParts.join(" ").trim();

    if (!date || amount == null || amount === 0 || !description) {
      skipped++;
      continue;
    }
    const rowCurrency = cols.currency != null ? detectCurrency(r[cols.currency] ?? "") : null;
    out.push({
      date,
      description: description.slice(0, 300),
      amount: Math.round(amount * 100) / 100,
      currency: rowCurrency ?? headerCurrency ?? defaultCurrency,
      reference: cols.reference != null ? (r[cols.reference] || null) : null,
      extraction_confidence: confidence,
    });
  }

  if (!out.length) throw new StatementError("NO_TRANSACTIONS", "CaiMao couldn't read any transactions from this file.");
  if (skipped) warnings.push(`skipped_rows:${skipped}`);
  if (!headerCurrency && cols.currency == null) warnings.push(`assumed_currency:${defaultCurrency}`);

  return { rows: out, skipped, warnings, currency: headerCurrency ?? out[0].currency, account_hint: accountHint(preamble) };
}
