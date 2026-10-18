import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { freshRepo } from "./helpers";
import { uploadStatement, confirmImport, recategorise, deleteStatement } from "@/lib/statements/service";
import { parseCsvStatement } from "@/lib/statements/parse-csv";
import { parseDate, parseAmount } from "@/lib/statements/fields";
import { maskIdentifiers, normaliseMerchant } from "@/lib/statements/normalise";
import { classifyDetailed } from "@/lib/budget/classifier";
import { DomainError } from "@/lib/finance";
import type { MemoryRepository } from "@/lib/data/memory";

const SAMPLE_CSV = fs.readFileSync(path.join(__dirname, "../public/samples/caimao-sample-statement.csv"));
const SAMPLE_PDF = fs.readFileSync(path.join(__dirname, "../public/samples/caimao-sample-statement.pdf"));
const bytes = (b: Buffer | string) => new Uint8Array(typeof b === "string" ? Buffer.from(b) : b);

let repo: MemoryRepository;
beforeEach(() => {
  repo = freshRepo();
});

describe("statement parsing", () => {
  it("TEST 1: a valid CSV bank statement parses into normalised, classified transactions", async () => {
    const { upload, transactions } = await uploadStatement(repo, { bytes: bytes(SAMPLE_CSV), fileName: "statement.csv", consent: true });
    expect(upload.file_type).toBe("csv");
    expect(upload.status).toBe("PREVIEW");
    expect(upload.currency).toBe("GBP");
    expect(upload.row_count).toBe(92);
    expect(upload.account_hint).toBe("••••7730");
    const tesco = transactions.find((t) => /tesco/i.test(t.description))!;
    expect(tesco.merchant).toBe("Tesco");
    expect(tesco.category).toBe("Food");
    expect(tesco.subcategory).toBe("Groceries");
    expect(tesco.confidence).toBeGreaterThan(0.9);
    expect(tesco.amount).toBeLessThan(0);
    const pay = transactions.find((t) => /payroll/i.test(t.description))!;
    expect(pay.category).toBe("Income");
    expect(pay.amount).toBeGreaterThan(0);
    // Identifiers are masked before anything is stored.
    expect(transactions.some((t) => t.description.includes("40329981"))).toBe(false);
  });

  it("parses a text-based PDF statement and uses the running balance for money in/out", async () => {
    const { upload, transactions } = await uploadStatement(repo, { bytes: bytes(SAMPLE_PDF), fileName: "statement.pdf", consent: true });
    expect(upload.file_type).toBe("pdf");
    expect(transactions.length).toBeGreaterThanOrEqual(85);
    expect(transactions.find((t) => /family support/i.test(t.description))!.amount).toBeGreaterThan(0);
    expect(transactions.find((t) => /northgate/i.test(t.description))!.amount).toBe(-850);
  });

  it("TEST 2: an invalid file fails safely with a clear reason and nothing is stored", async () => {
    const attempts: [Uint8Array, string, string][] = [
      [bytes(""), "empty.csv", "EMPTY"],
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "statement.csv", "UNSUPPORTED_TYPE"],
      [new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), "statement.pdf", "UNSUPPORTED_TYPE"],
      [bytes("%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >>"), "locked.pdf", "PDF_ENCRYPTED"],
      [bytes("%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"), "script.pdf", "PDF_ACTIVE_CONTENT"],
      [bytes("hello,world\nno,dates here"), "notes.csv", "NO_TRANSACTIONS"],
      [new Uint8Array(5 * 1024 * 1024 + 1), "big.csv", "TOO_LARGE"],
    ];
    for (const [b, name, reason] of attempts) {
      const err = await uploadStatement(repo, { bytes: b, fileName: name, consent: true }).catch((e) => e);
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).details.reason).toBe(reason);
    }
    expect(await repo.listStatements()).toHaveLength(0);
    const failures = (await repo.listAudit()).filter((a) => a.action === "STATEMENT_UPLOADED" && a.result === "FAILURE");
    expect(failures).toHaveLength(attempts.length);
  });

  it("refuses to read a statement without consent", async () => {
    await expect(uploadStatement(repo, { bytes: bytes(SAMPLE_CSV), fileName: "s.csv", consent: false })).rejects.toThrow(/agree/);
    expect(await repo.listStatements()).toHaveLength(0);
  });

  it("reads common date, amount and header variants", () => {
    expect(parseDate("31/01/2026", "dmy")).toBe("2026-01-31");
    expect(parseDate("01/31/2026", "mdy")).toBe("2026-01-31");
    expect(parseDate("2026-02-03")).toBe("2026-02-03");
    expect(parseDate("3 Feb 2026")).toBe("2026-02-03");
    expect(parseDate("2026年2月3日")).toBe("2026-02-03");
    expect(parseAmount("(12.50)")).toBe(-12.5);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("12.00 DR")).toBe(-12);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("£-9.99")).toBe(-9.99);
    const cn = parseCsvStatement("交易日期,交易描述,金额,币种\n2026-09-01,美团外卖,-35.5,CNY\n2026-09-02,工资,8000,CNY\n", "CNY");
    expect(cn.rows).toHaveLength(2);
    expect(cn.rows[0].amount).toBe(-35.5);
    const jp = parseCsvStatement("日付,お取引内容,お引出し,お預入れ\n2026/09/01,セブン-イレブン,540,\n2026/09/25,給与,,180000\n", "JPY");
    expect(jp.rows.map((r) => r.amount)).toEqual([-540, 180000]);
  });

  it("normalises merchants and masks identifiers", () => {
    expect(normaliseMerchant("CARD PAYMENT TESCO STORES 2873 LONDON")).toBe("Tesco Stores");
    expect(maskIdentifiers("TFR TO 4000 1234 5678 9010")).toBe("TFR TO ••••9010");
    expect(maskIdentifiers("IBAN GB29NWBK60161331926819")).toContain("••••6819");
    expect(classifyDetailed("", "SOMETHING UNKNOWN 123", -20)).toMatchObject({ category: "Other", source: "fallback" });
    expect(classifyDetailed("", "SOMETHING UNKNOWN 123", -20).confidence).toBeLessThan(0.7);
  });
});

describe("import confirmation and analysis", () => {
  it("TEST 3: the user must confirm extracted transactions before any analysis is saved", async () => {
    const { upload } = await uploadStatement(repo, { bytes: bytes(SAMPLE_CSV), fileName: "s.csv", consent: true });
    expect(await repo.getStatementAnalysis(upload.id)).toBeNull();
    expect((await repo.getStatement(upload.id))!.status).toBe("PREVIEW");
    const balancesBefore = await repo.listAccounts();
    const ledgerBefore = (await repo.listTransactions()).length;

    const { analysis } = await confirmImport(repo, upload.id);
    expect((await repo.getStatement(upload.id))!.status).toBe("CONFIRMED");
    expect(await repo.getStatementAnalysis(upload.id)).not.toBeNull();
    expect(analysis.totals.expenses).toBeGreaterThan(0);
    // A statement never changes balances or the main ledger.
    expect(await repo.listAccounts()).toEqual(balancesBefore);
    expect((await repo.listTransactions()).length).toBe(ledgerBefore);
    // Can't confirm twice.
    await expect(confirmImport(repo, upload.id)).rejects.toThrow(/already/);

    const actions = (await repo.listAudit()).map((a) => a.action);
    for (const a of ["STATEMENT_UPLOADED", "STATEMENT_PARSED", "TRANSACTIONS_EXTRACTED", "USER_CONFIRMED_IMPORT", "SPENDING_ANALYSIS_COMPLETED"]) expect(actions).toContain(a);
  });

  it("TEST 4: spending analysis identifies recurring subscriptions and the rise in eating out", async () => {
    const { upload } = await uploadStatement(repo, { bytes: bytes(SAMPLE_CSV), fileName: "s.csv", consent: true });
    const { analysis } = await confirmImport(repo, upload.id);
    const subs = analysis.recurring.filter((r) => r.is_subscription).map((r) => r.merchant);
    expect(subs).toEqual(expect.arrayContaining(["Spotify", "Netflix", "giffgaff", "Amazon Prime"]));
    expect(analysis.subscriptions.count).toBeGreaterThanOrEqual(5);
    expect(analysis.recurring.find((r) => r.merchant === "Spotify")!.cadence).toBe("monthly");
    expect(analysis.insights.map((i) => i.code)).toContain("subscriptions");
    const eatingOut = analysis.insights.find((i) => i.code === "category_above_average" && i.params.category === "eating_out");
    expect(eatingOut).toBeTruthy();
    expect(analysis.unusual[0].merchant).toMatch(/currys/i);
    expect(analysis.opportunity.method).toBe("above_average");
    expect(analysis.opportunity.monthly).toBeGreaterThan(0);
    expect(analysis.is_estimate).toBe(true);
  });

  it("category edits are saved, audited and flow into the analysis", async () => {
    const { upload, transactions } = await uploadStatement(repo, { bytes: bytes(SAMPLE_CSV), fileName: "s.csv", consent: true });
    const laptop = transactions.find((t) => /currys/i.test(t.description))!;
    await recategorise(repo, upload.id, [{ id: laptop.id, category: "Education" }]);
    const updated = (await repo.listStatementTransactions(upload.id)).find((t) => t.id === laptop.id)!;
    expect(updated).toMatchObject({ category: "Education", category_source: "user", needs_review: false });
    expect((await repo.listAudit()).some((a) => a.action === "TRANSACTION_RECATEGORISED")).toBe(true);
  });

  it("the user can delete a statement and its analysis", async () => {
    const { upload } = await uploadStatement(repo, { bytes: bytes(SAMPLE_CSV), fileName: "s.csv", consent: true });
    await confirmImport(repo, upload.id);
    await deleteStatement(repo, upload.id);
    expect(await repo.getStatement(upload.id)).toBeNull();
    expect(await repo.listStatementTransactions(upload.id)).toHaveLength(0);
    expect(await repo.getStatementAnalysis(upload.id)).toBeNull();
    expect((await repo.listAudit()).some((a) => a.action === "STATEMENT_DELETED")).toBe(true);
  });

  it("unconfirmed previews expire", async () => {
    const { upload } = await uploadStatement(repo, { bytes: bytes(SAMPLE_CSV), fileName: "s.csv", consent: true });
    expect(await repo.purgeExpiredStatements(new Date(Date.now() + 2 * 3600_000))).toBe(1);
    expect(await repo.getStatement(upload.id)).toBeNull();
  });
});
