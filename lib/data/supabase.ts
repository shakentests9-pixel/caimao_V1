import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountRequirements,
  BankProduct,
  CreditSystemInfo,
  FinancialSetupProgress,
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
import { buildSeed, type SeedScenario } from "../seed";
import { RepositoryError, type CommitExecutionInput, type Repository, type StatementTransactionPatch } from "./repository";
import { REFERENCE } from "../reference";

/**
 * PostgreSQL storage through Supabase.
 *  - Reads use the signed-in user's client, so row-level security applies.
 *  - Writes use the service-role client on the server, always filtered by the
 *    verified user id. Users have no write policies on money tables.
 *  - The execution commit runs in one database transaction (commit_sandbox_execution).
 */
const num = (v: unknown) => (v == null ? v : Number(v)) as number;

export class SupabaseRepository implements Repository {
  readonly mode = "supabase" as const;
  constructor(
    private readonly user: SupabaseClient,
    private readonly admin: SupabaseClient,
    readonly userId: string,
  ) {}

  private async rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await q;
    if (error) throw new RepositoryError("STORAGE", error.message);
    return (data ?? []) as T[];
  }
  private async check(q: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await q;
    if (error) throw new RepositoryError("STORAGE", error.message);
  }

  async getProfile(): Promise<Profile> {
    const [row] = await this.rows<Profile & { demo_scenario: string }>(this.user.from("profiles").select("*").eq("id", this.userId));
    if (!row) throw new RepositoryError("NOT_FOUND", "Profile not found. Run the seed script for this user.");
    const { data: u } = await this.user.from("users").select("email").eq("id", this.userId).maybeSingle();
    return {
      ...row,
      email: (u?.email as string) ?? "",
      ai_permission_level: num(row.ai_permission_level),
      nationality: row.nationality ?? null,
      visa_type: row.visa_type ?? null,
      residency_status: row.residency_status ?? null,
      student_status: row.student_status ?? null,
      age: row.age == null ? null : num(row.age),
      tax_residency: row.tax_residency ?? null,
      language: row.language ?? "en",
    };
  }
  async updateProfile(patch: Parameters<Repository["updateProfile"]>[0]) {
    await this.check(this.admin.from("profiles").update(patch).eq("id", this.userId));
    return this.getProfile();
  }

  async listAccounts() {
    const r = await this.rows<Account>(this.user.from("accounts").select("*").eq("user_id", this.userId).order("created_at"));
    return r.map((a) => ({ ...a, balance: num(a.balance) }));
  }
  async listTransactions() {
    const r = await this.rows<Transaction>(this.user.from("transactions").select("*").eq("user_id", this.userId).order("date", { ascending: false }));
    return r.map((t) => ({ ...t, amount: num(t.amount) }));
  }
  async listObligations() {
    const r = await this.rows<Obligation>(this.user.from("obligations").select("*").eq("user_id", this.userId).order("due_date"));
    return r.map((o) => ({ ...o, amount: num(o.amount) }));
  }
  async listBudgets() {
    const r = await this.rows<Budget>(this.user.from("budgets").select("*").eq("user_id", this.userId));
    return r.map((b) => ({ ...b, monthly_limit: num(b.monthly_limit) }));
  }
  async listCreditCards() {
    const r = await this.rows<CreditCard>(this.user.from("credit_cards").select("*").eq("user_id", this.userId));
    return r.map((c) => ({ ...c, credit_limit: num(c.credit_limit), current_balance: num(c.current_balance), minimum_payment: num(c.minimum_payment) }));
  }
  async listChecklist() {
    return this.rows<ChecklistItem>(this.user.from("bank_setup_checklist").select("*").eq("user_id", this.userId).order("id"));
  }
  async setChecklistItem(id: string, completed: boolean) {
    await this.check(this.user.from("bank_setup_checklist").update({ completed }).eq("id", id).eq("user_id", this.userId));
  }

  async listCountryRules() {
    const r = await this.rows<CountryRule>(this.user.from("country_rules").select("*"));
    const n = (v: number | null | undefined) => (v == null ? null : num(v));
    return r.map((x) => ({ ...x, limit_amount: n(x.limit_amount), minimum_amount: n(x.minimum_amount), maximum_amount: n(x.maximum_amount) }));
  }
  async listFxRates() {
    const r = await this.rows<FxRate>(this.user.from("fx_rates").select("*"));
    return r.map((x) => ({ ...x, rate: num(x.rate) }));
  }
  async listProviders() {
    const r = await this.rows<RemittanceProvider>(this.user.from("remittance_providers").select("*"));
    return r.map((p) => ({
      ...p,
      fx_margin: num(p.fx_margin),
      fixed_fee: num(p.fixed_fee),
      pct_fee: num(p.pct_fee),
      other_charges: num(p.other_charges),
      max_single_transfer: num(p.max_single_transfer),
    }));
  }

  async saveQuotes(quotes: RemittanceQuote[]) {
    if (!quotes.length) return;
    await this.check(
      this.admin.from("remittance_quotes").insert(quotes.map((q) => ({ id: q.id, user_id: this.userId, provider_id: q.provider_id, payload: q, created_at: q.created_at }))),
    );
  }
  async getQuote(id: string) {
    const [row] = await this.rows<{ payload: RemittanceQuote }>(this.user.from("remittance_quotes").select("payload").eq("id", id));
    return row?.payload ?? null;
  }

  private static toTr(r: Record<string, unknown>): TransferRequest {
    const n = ["source_amount", "destination_amount", "provider_fx_rate", "market_fx_rate", "transfer_fee", "total_cost"];
    const out = { ...r } as Record<string, unknown>;
    for (const k of n) out[k] = num(r[k]);
    return out as unknown as TransferRequest;
  }
  async createTransferRequest(tr: TransferRequest) {
    await this.check(this.admin.from("transfer_requests").insert(tr));
    return tr;
  }
  async getTransferRequest(id: string) {
    const [row] = await this.rows<Record<string, unknown>>(this.user.from("transfer_requests").select("*").eq("id", id).eq("user_id", this.userId));
    return row ? SupabaseRepository.toTr(row) : null;
  }
  async listTransferRequests() {
    const r = await this.rows<Record<string, unknown>>(this.user.from("transfer_requests").select("*").eq("user_id", this.userId).order("created_at", { ascending: false }));
    return r.map(SupabaseRepository.toTr);
  }
  async transitionTransferRequest(id: string, from: TransferRequest["status"][], patch: Partial<TransferRequest>) {
    const r = await this.rows<Record<string, unknown>>(
      this.admin.from("transfer_requests").update(patch).eq("id", id).eq("user_id", this.userId).in("status", from).select("*"),
    );
    return r[0] ? SupabaseRepository.toTr(r[0]) : null;
  }

  async commitExecution(input: CommitExecutionInput) {
    const { data, error } = await this.admin.rpc("commit_sandbox_execution", {
      p_user_id: input.userId,
      p_transfer_request_id: input.transferRequestId,
      p_debit_account_id: input.debit.accountId,
      p_debit_amount: input.debit.amount,
      p_execution: input.execution,
      p_ledger: input.ledgerEntry,
      p_obligation_id: input.obligationId,
    });
    if (error) {
      const code = error.message.includes("INSUFFICIENT_FUNDS") ? "INSUFFICIENT_FUNDS" : error.message.includes("NOT_FOUND") ? "NOT_FOUND" : "CONFLICT";
      throw new RepositoryError(code, error.message);
    }
    const res = data as { execution_id: string; transaction_id: string; new_balance: number; timestamp: string };
    const execution: PaymentExecution = { ...input.execution, id: res.execution_id, transaction_id: res.transaction_id, timestamp: res.timestamp };
    return { execution, newBalance: num(res.new_balance) };
  }
  async listExecutions() {
    const r = await this.rows<PaymentExecution>(this.user.from("payment_executions").select("*").eq("user_id", this.userId).order("timestamp", { ascending: false }));
    return r.map((e) => ({ ...e, source_amount: num(e.source_amount), destination_amount: num(e.destination_amount), fee: num(e.fee) }));
  }

  async appendAudit(entry: Omit<AuditLog, "id" | "timestamp" | "user_id">) {
    const [row] = await this.rows<AuditLog>(this.admin.from("audit_logs").insert({ ...entry, user_id: this.userId }).select("*"));
    return row;
  }
  async listAudit() {
    return this.rows<AuditLog>(this.user.from("audit_logs").select("*").eq("user_id", this.userId).order("timestamp", { ascending: false }).limit(500));
  }

  async appendConversation(msg: Omit<AiConversationMessage, "id" | "created_at" | "user_id">) {
    await this.check(this.user.from("ai_conversations").insert({ ...msg, user_id: this.userId }));
  }

  async listBanks() {
    return this.rows<BankProduct>(this.user.from("banks").select("*").order("country").order("bank_name"));
  }
  async listAccountRequirements() {
    return this.rows<AccountRequirements>(this.user.from("bank_account_requirements").select("*"));
  }
  async listCreditSystems() {
    return this.rows<CreditSystemInfo>(this.user.from("credit_system_rules").select("*"));
  }

  async listSetupProgress() {
    return this.rows<FinancialSetupProgress>(this.user.from("user_financial_setup").select("*").eq("user_id", this.userId));
  }
  async setSetupProgress(country: SupportedCountry, stepKey: string, completed: boolean) {
    await this.check(
      this.admin
        .from("user_financial_setup")
        .upsert({ user_id: this.userId, country, step_key: stepKey, completed, updated_at: new Date().toISOString() }, { onConflict: "user_id,country,step_key" }),
    );
  }

  async createStatement(upload: StatementUpload, transactions: StatementTransaction[]) {
    if (upload.user_id !== this.userId || transactions.some((t) => t.user_id !== this.userId || t.upload_id !== upload.id)) {
      throw new RepositoryError("CONFLICT", "Statement rows must belong to the signed-in user");
    }
    await this.check(this.admin.from("statement_uploads").insert(upload));
    if (transactions.length) {
      const { error } = await this.admin.from("statement_transactions").insert(transactions);
      if (error) {
        await this.admin.from("statement_uploads").delete().eq("id", upload.id).eq("user_id", this.userId);
        throw new RepositoryError("STORAGE", error.message);
      }
    }
  }
  async getStatement(id: string) {
    const [row] = await this.rows<StatementUpload>(this.user.from("statement_uploads").select("*").eq("id", id).eq("user_id", this.userId));
    return row ?? null;
  }
  async listStatements() {
    return this.rows<StatementUpload>(this.user.from("statement_uploads").select("*").eq("user_id", this.userId).order("created_at", { ascending: false }));
  }
  async listStatementTransactions(uploadId: string) {
    const r = await this.rows<StatementTransaction>(
      this.user.from("statement_transactions").select("*").eq("upload_id", uploadId).eq("user_id", this.userId).order("date", { ascending: false }),
    );
    return r.map((t) => ({ ...t, amount: num(t.amount), confidence: num(t.confidence) }));
  }
  async updateStatementTransactions(uploadId: string, patches: StatementTransactionPatch[]) {
    if (!(await this.getStatement(uploadId))) throw new RepositoryError("NOT_FOUND", "Statement not found");
    for (const { id, ...patch } of patches) {
      await this.check(this.admin.from("statement_transactions").update(patch).eq("id", id).eq("upload_id", uploadId).eq("user_id", this.userId));
    }
  }
  async confirmStatement(uploadId: string, analysis: StatementAnalysisRecord) {
    if (analysis.user_id !== this.userId || analysis.upload_id !== uploadId) throw new RepositoryError("CONFLICT", "Analysis does not match the statement");
    const { data, error } = await this.admin
      .from("statement_uploads")
      .update({ status: "CONFIRMED", confirmed_at: new Date().toISOString(), expires_at: null })
      .eq("id", uploadId)
      .eq("user_id", this.userId)
      .eq("status", "PREVIEW")
      .select("id");
    if (error) throw new RepositoryError("STORAGE", error.message);
    if (!data?.length) throw new RepositoryError("CONFLICT", "Only a statement preview can be confirmed");
    await this.check(this.admin.from("statement_analyses").upsert(analysis, { onConflict: "upload_id" }));
  }
  async saveStatementAnalysis(uploadId: string, analysis: StatementAnalysisRecord) {
    const upload = await this.getStatement(uploadId);
    if (!upload || upload.status !== "CONFIRMED") throw new RepositoryError("CONFLICT", "Only a confirmed statement has an analysis");
    if (analysis.user_id !== this.userId || analysis.upload_id !== uploadId) throw new RepositoryError("CONFLICT", "Analysis does not match the statement");
    await this.check(this.admin.from("statement_analyses").upsert(analysis, { onConflict: "upload_id" }));
  }
  async getStatementAnalysis(uploadId: string) {
    const [row] = await this.rows<StatementAnalysisRecord>(this.user.from("statement_analyses").select("*").eq("upload_id", uploadId).eq("user_id", this.userId));
    return row ?? null;
  }
  async deleteStatement(uploadId: string) {
    // Transactions and the analysis are removed by ON DELETE CASCADE.
    const { data, error } = await this.admin.from("statement_uploads").delete().eq("id", uploadId).eq("user_id", this.userId).select("id");
    if (error) throw new RepositoryError("STORAGE", error.message);
    return (data?.length ?? 0) > 0;
  }
  async purgeExpiredStatements(now = new Date()) {
    const { data, error } = await this.admin
      .from("statement_uploads")
      .delete()
      .eq("user_id", this.userId)
      .eq("status", "PREVIEW")
      .lt("expires_at", now.toISOString())
      .select("id");
    if (error) throw new RepositoryError("STORAGE", error.message);
    return data?.length ?? 0;
  }

  async getScenario() {
    const { data } = await this.user.from("profiles").select("demo_scenario").eq("id", this.userId).maybeSingle();
    return ((data?.demo_scenario as string) ?? "standard") as SeedScenario["id"];
  }

  /** Re-seeds this user's demo data. Audit history is append-only and is kept. */
  async reset(scenario: SeedScenario["id"] = "standard") {
    const { language } = await this.getProfile();
    await seedSupabaseUser(this.admin, this.userId, scenario, undefined, { language });
  }
}

/** Writes the demo dataset for one user. Used by reset and by scripts/seed-supabase.ts. */
export async function seedSupabaseUser(
  admin: SupabaseClient,
  userId: string,
  scenario: SeedScenario["id"] = "standard",
  email?: string,
  keep: Partial<Pick<Profile, "language">> = {},
) {
  const seed = buildSeed(new Date(), scenario);
  const ok = async (q: PromiseLike<{ error: { message: string } | null }>, what: string) => {
    const { error } = await q;
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  // Shared reference data (idempotent).
  await ok(admin.from("country_rules").upsert(seed.country_rules), "country_rules");
  await ok(admin.from("fx_rates").upsert(seed.fx_rates), "fx_rates");
  await ok(admin.from("remittance_providers").upsert(seed.remittance_providers), "remittance_providers");
  await ok(admin.from("banks").upsert(REFERENCE.banks), "banks");
  await ok(admin.from("bank_account_requirements").upsert(REFERENCE.accountRequirements), "bank_account_requirements");
  await ok(admin.from("credit_system_rules").upsert(REFERENCE.creditSystems), "credit_system_rules");

  if (email) await ok(admin.from("users").upsert({ id: userId, email }), "users");

  // Per-user ids are prefixed so several demo users can coexist.
  const pid = (id: string) => `${userId.slice(0, 8)}-${id}`;
  await ok(admin.from("payment_executions").delete().eq("user_id", userId), "clear executions");
  await ok(admin.from("transfer_requests").delete().eq("user_id", userId), "clear transfer requests");
  await ok(admin.from("remittance_quotes").delete().eq("user_id", userId), "clear quotes");
  for (const t of ["transactions", "obligations", "budgets", "credit_cards", "bank_setup_checklist", "accounts"]) {
    await ok(admin.from(t).delete().eq("user_id", userId), `clear ${t}`);
  }

  const { email: _e, id: _id, ...profile } = seed.profile;
  await ok(admin.from("profiles").upsert({ ...profile, ...keep, id: userId, demo_scenario: scenario }), "profiles");
  await ok(admin.from("accounts").insert(seed.accounts.map((a) => ({ ...a, id: pid(a.id), user_id: userId }))), "accounts");
  await ok(admin.from("transactions").insert(seed.transactions.map((t) => ({ ...t, id: pid(t.id), account_id: pid(t.account_id), user_id: userId }))), "transactions");
  await ok(admin.from("obligations").insert(seed.obligations.map((o) => ({ ...o, id: pid(o.id), user_id: userId }))), "obligations");
  await ok(admin.from("budgets").insert(seed.budgets.map((b) => ({ ...b, id: pid(b.id), user_id: userId }))), "budgets");
  await ok(admin.from("credit_cards").insert(seed.credit_cards.map((c) => ({ ...c, id: pid(c.id), user_id: userId }))), "credit_cards");
  await ok(admin.from("bank_setup_checklist").insert(seed.checklist_items.map((c) => ({ ...c, id: pid(c.id), user_id: userId }))), "checklist");
}
