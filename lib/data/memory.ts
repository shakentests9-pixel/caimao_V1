import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  FinancialSetupProgress,
  StatementAnalysisRecord,
  StatementTransaction,
  StatementUpload,
  SupportedCountry,
  AiConversationMessage,
  AuditLog,
  PaymentExecution,
  RemittanceQuote,
  TransferRequest,
} from "../types";
import { buildSeed, DEMO_USER_ID, type DemoState, type SeedScenario } from "../seed";
import { RepositoryError, type CommitExecutionInput, type Repository, type StatementTransactionPatch } from "./repository";
import { REFERENCE } from "../reference";

/**
 * Local demo store. Lives on globalThis so it survives hot reloads, and is
 * mirrored to a JSON file so it survives server restarts. Set
 * UNIFLOW_DISABLE_PERSIST=1 to keep it purely in memory (tests do this).
 */
interface MemoryDb extends DemoState {
  remittance_quotes: RemittanceQuote[];
  transfer_requests: TransferRequest[];
  payment_executions: PaymentExecution[];
  audit_logs: AuditLog[];
  ai_conversations: AiConversationMessage[];
  txn_sequence: number;
  statement_uploads: StatementUpload[];
  statement_transactions: StatementTransaction[];
  statement_analyses: StatementAnalysisRecord[];
  setup_progress: FinancialSetupProgress[];
}

const STORE_VERSION = 4;
const g = globalThis as unknown as { __uniflowDb?: MemoryDb; __uniflowDbLoaded?: boolean };

function storePath(): string {
  const preferred = path.join(process.cwd(), ".data");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return path.join(preferred, "demo-db.json");
  } catch {
    return path.join(os.tmpdir(), "uniflow-demo-db.json");
  }
}

const persistEnabled = () => process.env.UNIFLOW_DISABLE_PERSIST !== "1";

function fresh(scenario: SeedScenario["id"] = "standard"): MemoryDb {
  return {
    ...buildSeed(new Date(), scenario),
    remittance_quotes: [],
    transfer_requests: [],
    payment_executions: [],
    audit_logs: [],
    ai_conversations: [],
    txn_sequence: 184,
    statement_uploads: [],
    statement_transactions: [],
    statement_analyses: [],
    setup_progress: [],
  };
}

function load(): MemoryDb {
  if (g.__uniflowDb) return g.__uniflowDb;
  if (persistEnabled() && !g.__uniflowDbLoaded) {
    g.__uniflowDbLoaded = true;
    try {
      const raw = JSON.parse(fs.readFileSync(storePath(), "utf8"));
      if (raw?.__version === STORE_VERSION) {
        delete raw.__version;
        g.__uniflowDb = raw as MemoryDb;
        return g.__uniflowDb;
      }
    } catch {
      /* no saved store yet */
    }
  }
  g.__uniflowDb = fresh();
  save();
  return g.__uniflowDb;
}

function save() {
  if (!persistEnabled() || !g.__uniflowDb) return;
  try {
    fs.writeFileSync(storePath(), JSON.stringify({ __version: STORE_VERSION, ...g.__uniflowDb }));
  } catch {
    /* read-only filesystem: keep running in memory */
  }
}

const clone = <T>(v: T): T => structuredClone(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

export class MemoryRepository implements Repository {
  readonly mode = "memory" as const;
  constructor(readonly userId: string = DEMO_USER_ID) {}

  private get db() {
    const db = load();
    if (this.userId !== db.profile.id) throw new RepositoryError("NOT_FOUND", "Unknown user");
    return db;
  }

  async getProfile() { return clone(this.db.profile); }
  async updateProfile(patch: Parameters<Repository["updateProfile"]>[0]) {
    Object.assign(this.db.profile, patch);
    save();
    return clone(this.db.profile);
  }
  async listAccounts() { return clone(this.db.accounts); }
  async listTransactions() { return clone([...this.db.transactions].sort((a, b) => b.date.localeCompare(a.date))); }
  async listObligations() { return clone([...this.db.obligations].sort((a, b) => a.due_date.localeCompare(b.due_date))); }
  async listBudgets() { return clone(this.db.budgets); }
  async listCreditCards() { return clone(this.db.credit_cards); }
  async listChecklist() { return clone(this.db.checklist_items); }
  async setChecklistItem(id: string, completed: boolean) {
    const item = this.db.checklist_items.find((c) => c.id === id);
    if (!item) throw new RepositoryError("NOT_FOUND", "Checklist item not found");
    item.completed = completed;
    save();
  }

  async listCountryRules() { return clone(this.db.country_rules); }
  async listFxRates() { return clone(this.db.fx_rates); }
  async listProviders() { return clone(this.db.remittance_providers); }

  async saveQuotes(quotes: RemittanceQuote[]) {
    this.db.remittance_quotes.push(...clone(quotes));
    // Keep the store small: quotes are short-lived.
    if (this.db.remittance_quotes.length > 300) this.db.remittance_quotes.splice(0, this.db.remittance_quotes.length - 300);
    save();
  }
  async getQuote(id: string) { return clone(this.db.remittance_quotes.find((q) => q.id === id) ?? null); }

  async createTransferRequest(tr: TransferRequest) {
    this.db.transfer_requests.push(clone(tr));
    save();
    return clone(tr);
  }
  async getTransferRequest(id: string) { return clone(this.db.transfer_requests.find((t) => t.id === id) ?? null); }
  async listTransferRequests() { return clone([...this.db.transfer_requests].reverse()); }
  async transitionTransferRequest(id: string, from: TransferRequest["status"][], patch: Partial<TransferRequest>) {
    const tr = this.db.transfer_requests.find((t) => t.id === id);
    if (!tr || !from.includes(tr.status)) return null;
    Object.assign(tr, patch);
    save();
    return clone(tr);
  }

  async commitExecution(input: CommitExecutionInput) {
    const db = this.db;
    const tr = db.transfer_requests.find((t) => t.id === input.transferRequestId);
    if (!tr || tr.status !== "EXECUTING") throw new RepositoryError("CONFLICT", "Transfer request is not executing");
    const account = db.accounts.find((a) => a.id === input.debit.accountId);
    if (!account) throw new RepositoryError("NOT_FOUND", "Funding account not found");
    if (account.balance < input.debit.amount) throw new RepositoryError("INSUFFICIENT_FUNDS", "Funding account balance is too low");

    // All checks passed: apply every write together.
    const year = new Date(input.execution.timestamp).getUTCFullYear();
    const execution: PaymentExecution = {
      ...input.execution,
      id: randomUUID(),
      transaction_id: `UF-${year}-${String(db.txn_sequence).padStart(6, "0")}`,
    };
    db.txn_sequence += 1;
    account.balance = round2(account.balance - input.debit.amount);
    db.payment_executions.push(execution);
    db.transactions.push({ ...input.ledgerEntry, id: `txn-${execution.transaction_id}` });
    if (input.obligationId) {
      const ob = db.obligations.find((o) => o.id === input.obligationId);
      if (ob) Object.assign(ob, { status: "PAID", paid_at: execution.timestamp, payment_execution_id: execution.id });
    }
    tr.status = "COMPLETED";
    save();
    return { execution: clone(execution), newBalance: account.balance };
  }
  async listExecutions() { return clone([...this.db.payment_executions].reverse()); }

  async appendAudit(entry: Omit<AuditLog, "id" | "timestamp" | "user_id">) {
    const log: AuditLog = { ...clone(entry), id: randomUUID(), timestamp: new Date().toISOString(), user_id: this.userId };
    this.db.audit_logs.push(log);
    save();
    return clone(log);
  }
  async listAudit() { return clone([...this.db.audit_logs].reverse()); }

  // Reference data comes straight from the researched modules.
  async listBanks() { return clone(REFERENCE.banks); }
  async listAccountRequirements() { return clone(REFERENCE.accountRequirements); }
  async listCreditSystems() { return clone(REFERENCE.creditSystems); }

  async listSetupProgress() { return clone(this.db.setup_progress.filter((p) => p.user_id === this.userId)); }
  async setSetupProgress(country: SupportedCountry, stepKey: string, completed: boolean) {
    const db = this.db;
    const row = db.setup_progress.find((p) => p.user_id === this.userId && p.country === country && p.step_key === stepKey);
    const updated_at = new Date().toISOString();
    if (row) Object.assign(row, { completed, updated_at });
    else db.setup_progress.push({ user_id: this.userId, country, step_key: stepKey, completed, updated_at });
    save();
  }

  async createStatement(upload: StatementUpload, transactions: StatementTransaction[]) {
    if (upload.user_id !== this.userId || transactions.some((t) => t.user_id !== this.userId || t.upload_id !== upload.id)) {
      throw new RepositoryError("CONFLICT", "Statement rows must belong to the signed-in user");
    }
    this.db.statement_uploads.push(clone(upload));
    this.db.statement_transactions.push(...clone(transactions));
    save();
  }
  private ownUpload(id: string) {
    return this.db.statement_uploads.find((u) => u.id === id && u.user_id === this.userId) ?? null;
  }
  async getStatement(id: string) { return clone(this.ownUpload(id)); }
  async listStatements() {
    return clone(this.db.statement_uploads.filter((u) => u.user_id === this.userId).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  async listStatementTransactions(uploadId: string) {
    if (!this.ownUpload(uploadId)) return [];
    return clone(this.db.statement_transactions.filter((t) => t.upload_id === uploadId && t.user_id === this.userId).sort((a, b) => b.date.localeCompare(a.date)));
  }
  async updateStatementTransactions(uploadId: string, patches: StatementTransactionPatch[]) {
    if (!this.ownUpload(uploadId)) throw new RepositoryError("NOT_FOUND", "Statement not found");
    for (const { id, ...patch } of patches) {
      const row = this.db.statement_transactions.find((t) => t.id === id && t.upload_id === uploadId && t.user_id === this.userId);
      if (row) Object.assign(row, patch);
    }
    save();
  }
  async confirmStatement(uploadId: string, analysis: StatementAnalysisRecord) {
    const upload = this.ownUpload(uploadId);
    if (!upload || upload.status !== "PREVIEW") throw new RepositoryError("CONFLICT", "Only a statement preview can be confirmed");
    if (analysis.user_id !== this.userId || analysis.upload_id !== uploadId) throw new RepositoryError("CONFLICT", "Analysis does not match the statement");
    Object.assign(upload, { status: "CONFIRMED", confirmed_at: new Date().toISOString(), expires_at: null });
    this.db.statement_analyses = this.db.statement_analyses.filter((a) => a.upload_id !== uploadId);
    this.db.statement_analyses.push(clone(analysis));
    save();
  }
  async saveStatementAnalysis(uploadId: string, analysis: StatementAnalysisRecord) {
    const upload = this.ownUpload(uploadId);
    if (!upload || upload.status !== "CONFIRMED") throw new RepositoryError("CONFLICT", "Only a confirmed statement has an analysis");
    if (analysis.user_id !== this.userId || analysis.upload_id !== uploadId) throw new RepositoryError("CONFLICT", "Analysis does not match the statement");
    this.db.statement_analyses = this.db.statement_analyses.filter((a) => a.upload_id !== uploadId);
    this.db.statement_analyses.push(clone(analysis));
    save();
  }
  async getStatementAnalysis(uploadId: string) {
    if (!this.ownUpload(uploadId)) return null;
    return clone(this.db.statement_analyses.find((a) => a.upload_id === uploadId && a.user_id === this.userId) ?? null);
  }
  async deleteStatement(uploadId: string) {
    if (!this.ownUpload(uploadId)) return false;
    const db = this.db;
    db.statement_uploads = db.statement_uploads.filter((u) => u.id !== uploadId);
    db.statement_transactions = db.statement_transactions.filter((t) => t.upload_id !== uploadId);
    db.statement_analyses = db.statement_analyses.filter((a) => a.upload_id !== uploadId);
    save();
    return true;
  }
  async purgeExpiredStatements(now = new Date()) {
    const expired = this.db.statement_uploads.filter((u) => u.user_id === this.userId && u.status === "PREVIEW" && u.expires_at && u.expires_at < now.toISOString());
    for (const u of expired) await this.deleteStatement(u.id);
    return expired.length;
  }

  async appendConversation(msg: Omit<AiConversationMessage, "id" | "created_at" | "user_id">) {
    this.db.ai_conversations.push({ ...msg, id: randomUUID(), created_at: new Date().toISOString(), user_id: this.userId });
    if (this.db.ai_conversations.length > 400) this.db.ai_conversations.splice(0, 100);
    save();
  }

  async getScenario() { return this.db.scenario; }
  async reset(scenario: SeedScenario["id"] = "standard") {
    // A demo reset restores the data but keeps the user's language choice.
    const language = g.__uniflowDb?.profile.language;
    g.__uniflowDb = fresh(scenario);
    if (language) g.__uniflowDb.profile.language = language;
    save();
  }
}

/** Test helper: start from a clean seed without touching disk. */
export function resetMemoryStore(scenario: SeedScenario["id"] = "standard") {
  g.__uniflowDb = fresh(scenario);
  g.__uniflowDbLoaded = true;
}
