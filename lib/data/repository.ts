import type {
  AccountRequirements,
  BankProduct,
  CreditSystemInfo,
  FinancialSetupProgress,
  ProfilePatch,
  StatementAnalysisRecord,
  StatementTransaction,
  StatementUpload,
  SupportedCountry,
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
  updateProfile(patch: ProfilePatch): Promise<Profile>;

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

  // ── Banking abroad reference data (shared, read-only) ──
  listBanks(): Promise<BankProduct[]>;
  listAccountRequirements(): Promise<AccountRequirements[]>;
  listCreditSystems(): Promise<CreditSystemInfo[]>;

  // ── Financial Setup journey progress (per user) ──
  listSetupProgress(): Promise<FinancialSetupProgress[]>;
  setSetupProgress(country: SupportedCountry, stepKey: string, completed: boolean): Promise<void>;

  // ── Statement analysis (per user). Raw files are never passed to the repository. ──
  createStatement(upload: StatementUpload, transactions: StatementTransaction[]): Promise<void>;
  getStatement(id: string): Promise<StatementUpload | null>;
  listStatements(): Promise<StatementUpload[]>;
  listStatementTransactions(uploadId: string): Promise<StatementTransaction[]>;
  updateStatementTransactions(uploadId: string, patches: StatementTransactionPatch[]): Promise<void>;
  /** Marks the upload CONFIRMED and stores its analysis together. Fails if it isn't the user's PREVIEW upload. */
  confirmStatement(uploadId: string, analysis: StatementAnalysisRecord): Promise<void>;
  /** Replaces the analysis of an already-confirmed statement (after category edits). */
  saveStatementAnalysis(uploadId: string, analysis: StatementAnalysisRecord): Promise<void>;
  getStatementAnalysis(uploadId: string): Promise<StatementAnalysisRecord | null>;
  /** Hard-deletes the upload, its transactions and its analysis. Audit entries stay. */
  deleteStatement(uploadId: string): Promise<boolean>;
  /** Removes unconfirmed previews past their expiry. Returns how many were removed. */
  purgeExpiredStatements(now?: Date): Promise<number>;

  appendConversation(msg: Omit<AiConversationMessage, "id" | "created_at" | "user_id">): Promise<void>;

  getScenario(): Promise<SeedScenario["id"]>;
  reset(scenario?: SeedScenario["id"]): Promise<void>;
}

export type StatementTransactionPatch = { id: string } & Partial<Pick<StatementTransaction, "category" | "subcategory" | "included" | "needs_review" | "category_source" | "confidence">>;

export class RepositoryError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INSUFFICIENT_FUNDS" | "CONFLICT" | "STORAGE",
    message: string,
  ) {
    super(message);
  }
}
