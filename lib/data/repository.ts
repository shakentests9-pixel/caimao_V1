import type {
  Account,
  AiConversationMessage,
  AuditLog,
  Budget,
  ChecklistItem,
  CountryRule,
  CreditCard,
  FxRate,
  Obligation,
  PaymentExecution,
  Profile,
  RemittanceProvider,
  RemittanceQuote,
  Transaction,
  TransferRequest,
} from "../types";
import type { SeedScenario } from "../seed";

export interface CommitExecutionInput {
  userId: string;
  transferRequestId: string;
  execution: Omit<PaymentExecution, "id" | "transaction_id">;
  /** Debit applied to the funding account. Must not take the balance below zero. */
  debit: { accountId: string; amount: number };
  ledgerEntry: Omit<Transaction, "id">;
  obligationId: string | null;
}

/**
 * Storage boundary. Two implementations:
 *  - MemoryRepository: local demo mode, no external services, used by tests.
 *  - SupabaseRepository: PostgreSQL with row-level security.
 * Every method is scoped to one user. Reference data (rules, FX, providers) is shared.
 */
export interface Repository {
  readonly mode: "memory" | "supabase";
  readonly userId: string;

  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Pick<Profile, "base_currency" | "ai_permission_level" | "documents_on_file">>): Promise<Profile>;

  listAccounts(): Promise<Account[]>;
  listTransactions(): Promise<Transaction[]>;
  listObligations(): Promise<Obligation[]>;
  listBudgets(): Promise<Budget[]>;
  listCreditCards(): Promise<CreditCard[]>;
  listChecklist(): Promise<ChecklistItem[]>;
  setChecklistItem(id: string, completed: boolean): Promise<void>;

  listCountryRules(): Promise<CountryRule[]>;
  listFxRates(): Promise<FxRate[]>;
  listProviders(): Promise<RemittanceProvider[]>;

  saveQuotes(quotes: RemittanceQuote[]): Promise<void>;
  getQuote(id: string): Promise<RemittanceQuote | null>;

  createTransferRequest(tr: TransferRequest): Promise<TransferRequest>;
  getTransferRequest(id: string): Promise<TransferRequest | null>;
  listTransferRequests(): Promise<TransferRequest[]>;
  /** Compare-and-set on status, so a request cannot be approved or executed twice. */
  transitionTransferRequest(id: string, from: TransferRequest["status"][], patch: Partial<TransferRequest>): Promise<TransferRequest | null>;

  /** Atomically records the execution, debits the account, writes the ledger entry, marks the obligation paid and completes the request. */
  commitExecution(input: CommitExecutionInput): Promise<{ execution: PaymentExecution; newBalance: number }>;
  listExecutions(): Promise<PaymentExecution[]>;

  appendAudit(entry: Omit<AuditLog, "id" | "timestamp" | "user_id">): Promise<AuditLog>;
  listAudit(): Promise<AuditLog[]>;

  appendConversation(msg: Omit<AiConversationMessage, "id" | "created_at" | "user_id">): Promise<void>;

  getScenario(): Promise<SeedScenario["id"]>;
  reset(scenario?: SeedScenario["id"]): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INSUFFICIENT_FUNDS" | "CONFLICT" | "STORAGE",
    message: string,
  ) {
    super(message);
  }
}
