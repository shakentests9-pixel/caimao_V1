import "server-only";
import { randomUUID } from "node:crypto";
import type { Repository, StatementTransactionPatch } from "../data/repository";
import { audit, type ActionContext } from "../audit";
import { getFxService, DomainError } from "../finance";
import { PermissionLevel, type StatementTransaction, type TransactionCategory } from "../types";
import { parseBankStatement } from "./pipeline";
import { suggestCategories } from "./ai-assist";
import { analyseStatement, type StatementAnalysis } from "./analyse";
import { StatementError } from "./validate";

/**
 * Statement workflow with consent and an audit trail:
 *   upload (consent) → STATEMENT_UPLOADED → parse → STATEMENT_PARSED → classify → TRANSACTIONS_EXTRACTED
 *   → preview (nothing saved as analysis yet) → user edits categories → TRANSACTIONS_CONFIRMED
 *   → analysis → SPENDING_ANALYSED.
 * Balances and the main ledger are never touched by a statement.
 */

export const workflowId = (uploadId: string) => `st-${uploadId.slice(0, 8)}`;

export async function uploadStatement(repo: Repository, input: { bytes: Uint8Array; fileName: string; consent: boolean }) {
  if (!input.consent) throw new DomainError("CONSENT_REQUIRED", "Please agree to let CaiMao read this statement first.");
  const profile = await repo.getProfile();
  await repo.purgeExpiredStatements();

  const pending: ActionContext = { repo, actor: "user", correlationId: `st-${randomUUID().slice(0, 8)}` };
  let parsed;
  try {
    parsed = await parseBankStatement(input.bytes, input.fileName, { userId: repo.userId, defaultCurrency: profile.study_currency });
  } catch (e) {
    await audit(pending, "STATEMENT_UPLOADED", {
      tool: "parseBankStatement",
      level: PermissionLevel.Read,
      result: "FAILURE",
      details: { size_bytes: input.bytes.length, consent: true, reason: e instanceof StatementError ? e.code : "UNREADABLE" },
    });
    if (e instanceof StatementError) throw new DomainError("INVALID_FILE", e.message, { reason: e.code });
    throw new DomainError("INVALID_FILE", "CaiMao couldn't read this statement.", { reason: "UNREADABLE" });
  }

  const { upload } = parsed;
  const ctx: ActionContext = { repo, actor: "user", correlationId: workflowId(upload.id) };
  await audit(ctx, "STATEMENT_UPLOADED", {
    tool: "parseBankStatement",
    details: { file_type: upload.file_type, size_bytes: upload.size_bytes, sha256: upload.sha256.slice(0, 12), consent: true, file_stored: false },
  });
  await audit(ctx, "STATEMENT_PARSED", {
    actor: "system",
    tool: "parseBankStatement",
    details: { rows: upload.row_count, period: [upload.period_start, upload.period_end], account_hint: upload.account_hint, warnings: upload.warnings },
  });

  const { rows, sent } = await suggestCategories(parsed.transactions);
  await audit(ctx, "TRANSACTIONS_EXTRACTED", {
    actor: "system",
    tool: "classifyTransactions",
    details: {
      rows: rows.length,
      needs_review: rows.filter((r) => r.needs_review).length,
      by_source: countBy(rows, (r) => r.category_source),
      ai_suggestions_requested: sent,
      ai_payload: sent ? "masked merchant name + direction only" : "none",
    },
  });

  await repo.createStatement({ ...upload, low_confidence_count: rows.filter((r) => r.needs_review).length }, rows);
  return { upload: (await repo.getStatement(upload.id))!, transactions: rows };
}

export async function recategorise(repo: Repository, uploadId: string, changes: { id: string; category?: TransactionCategory; included?: boolean }[]) {
  const upload = await repo.getStatement(uploadId);
  if (!upload) throw new DomainError("NOT_FOUND", "Statement not found.");
  const existing = new Map((await repo.listStatementTransactions(uploadId)).map((t) => [t.id, t]));
  const patches: StatementTransactionPatch[] = [];
  for (const c of changes) {
    const row = existing.get(c.id);
    if (!row) continue;
    const p: StatementTransactionPatch = { id: c.id };
    if (c.category && c.category !== row.category) Object.assign(p, { category: c.category, subcategory: null, category_source: "user", confidence: 1, needs_review: false });
    if (typeof c.included === "boolean" && c.included !== row.included) p.included = c.included;
    if (Object.keys(p).length > 1) patches.push(p);
  }
  if (!patches.length) return;
  await repo.updateStatementTransactions(uploadId, patches);
  await audit({ repo, actor: "user", correlationId: workflowId(uploadId) }, "TRANSACTION_RECATEGORISED", {
    details: { changed: patches.length, categories: patches.filter((p) => p.category).map((p) => p.category) },
  });
  // Analysis already saved for a confirmed statement is refreshed so it matches the edits.
  if (upload.status === "CONFIRMED") await runAnalysis(repo, uploadId, true);
}

export async function confirmImport(repo: Repository, uploadId: string) {
  const upload = await repo.getStatement(uploadId);
  if (!upload) throw new DomainError("NOT_FOUND", "Statement not found.");
  if (upload.status !== "PREVIEW") throw new DomainError("INVALID_STATE", "This statement has already been confirmed.");
  const ctx: ActionContext = { repo, actor: "user", correlationId: workflowId(uploadId) };
  const txns = await repo.listStatementTransactions(uploadId);
  await audit(ctx, "TRANSACTIONS_CONFIRMED", {
    approval: "APPROVED",
    details: { rows_included: txns.filter((t) => t.included).length, rows_excluded: txns.filter((t) => !t.included).length, unreviewed_low_confidence: txns.filter((t) => t.included && t.needs_review).length },
  });
  return runAnalysis(repo, uploadId, false, txns);
}

async function runAnalysis(repo: Repository, uploadId: string, refresh: boolean, txns?: StatementTransaction[]) {
  const [rows, accounts, obligations, profile, fx] = await Promise.all([
    txns ? Promise.resolve(txns) : repo.listStatementTransactions(uploadId),
    repo.listAccounts(),
    repo.listObligations(),
    repo.getProfile(),
    getFxService(repo),
  ]);
  const upload = (await repo.getStatement(uploadId))!;
  const analysis = analyseStatement(rows, {
    currency: upload.currency,
    fx,
    balances: accounts.map((a) => ({ amount: a.balance, currency: a.currency })),
    obligations,
  });
  const record = { id: randomUUID(), upload_id: uploadId, user_id: repo.userId, created_at: new Date().toISOString(), result: analysis as unknown as Record<string, unknown> };
  if (upload.status === "PREVIEW") await repo.confirmStatement(uploadId, record);
  else await repo.saveStatementAnalysis(uploadId, record); // re-analysis after edits
  await audit({ repo, actor: "system", correlationId: workflowId(uploadId) }, "SPENDING_ANALYSED", {
    tool: "analyseSpending",
    details: {
      rows: analysis.rows_analysed,
      currency: analysis.currency,
      insights: analysis.insights.map((i) => i.code),
      recurring: analysis.recurring.length,
      estimated_opportunity_monthly: analysis.opportunity.monthly,
      method: analysis.opportunity.method,
      profile_language: profile.language,
      refresh,
    },
  });
  return { upload: (await repo.getStatement(uploadId))!, analysis };
}

export async function deleteStatement(repo: Repository, uploadId: string) {
  const ok = await repo.deleteStatement(uploadId);
  if (!ok) throw new DomainError("NOT_FOUND", "Statement not found.");
  await audit({ repo, actor: "user", correlationId: workflowId(uploadId) }, "STATEMENT_DELETED", { details: { upload: uploadId.slice(0, 8), deleted: ["transactions", "analysis"] } });
}

export async function latestAnalysis(repo: Repository): Promise<{ uploadId: string; analysis: StatementAnalysis } | null> {
  const confirmed = (await repo.listStatements()).find((u) => u.status === "CONFIRMED");
  if (!confirmed) return null;
  const rec = await repo.getStatementAnalysis(confirmed.id);
  return rec ? { uploadId: confirmed.id, analysis: rec.result as unknown as StatementAnalysis } : null;
}

function countBy<T>(xs: T[], key: (x: T) => string) {
  const out: Record<string, number> = {};
  for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
}
