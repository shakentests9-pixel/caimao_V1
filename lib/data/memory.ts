import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AiConversationMessage,
  AuditLog,
  PaymentExecution,
  RemittanceQuote,
  TransferRequest,
} from "../types";
import { buildSeed, DEMO_USER_ID, type DemoState, type SeedScenario } from "../seed";
import { RepositoryError, type CommitExecutionInput, type Repository } from "./repository";

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
}

const STORE_VERSION = 3;
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

  async appendConversation(msg: Omit<AiConversationMessage, "id" | "created_at" | "user_id">) {
    this.db.ai_conversations.push({ ...msg, id: randomUUID(), created_at: new Date().toISOString(), user_id: this.userId });
    if (this.db.ai_conversations.length > 400) this.db.ai_conversations.splice(0, 100);
    save();
  }

  async getScenario() { return this.db.scenario; }
  async reset(scenario: SeedScenario["id"] = "standard") {
    g.__uniflowDb = fresh(scenario);
    save();
  }
}

/** Test helper: start from a clean seed without touching disk. */
export function resetMemoryStore(scenario: SeedScenario["id"] = "standard") {
  g.__uniflowDb = fresh(scenario);
  g.__uniflowDbLoaded = true;
}
