import { randomUUID } from "node:crypto";
import type {
  Account,
  ComplianceResult,
  CountryCode,
  Currency,
  Obligation,
  Profile,
  RemittanceQuote,
  TransferRequest,
} from "./types";
import { PermissionLevel } from "./types";
import { FxService, formatMoney, roundMoney } from "./fx/service";
import { evaluateCompliance, matchRules } from "./compliance/engine";
import { addBusinessDays, compareQuotes, quoteForDestinationAmount, quoteForSourceAmount, type QuoteComparison } from "./remittance/engine";
import { submitSandboxPayment } from "./payments/sandbox";
import { audit, type ActionContext } from "./audit";
import { RepositoryError, type Repository } from "./data/repository";

export class DomainError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "PERMISSION_DENIED"
      | "APPROVAL_REQUIRED"
      | "INSUFFICIENT_FUNDS"
      | "COMPLIANCE_BLOCKED"
      | "COMPLIANCE_ACTION_REQUIRED"
      | "INVALID_STATE"
      | "EXPIRED"
      | "PROVIDER_UNAVAILABLE"
      | "PAYMENT_FAILED"
      | "CONSENT_REQUIRED"
      | "INVALID_FILE",
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const TRANSFER_REQUEST_TTL_MINUTES = 15;

export async function getFxService(repo: Repository) {
  return new FxService(await repo.listFxRates());
}

/** Agent calls are capped by the user's standing permission; Level 3 is never standing. */
export async function assertPermission(ctx: ActionContext, profile: Profile, level: PermissionLevel, tool: string) {
  if (ctx.actor !== "ai_agent") return;
  const allowed = level <= PermissionLevel.Prepare && level <= profile.ai_permission_level;
  if (!allowed) {
    await audit(ctx, "PERMISSION_DENIED", {
      tool,
      level,
      result: "BLOCKED",
      details: { required_level: level, granted_level: profile.ai_permission_level },
    });
    throw new DomainError(
      "PERMISSION_DENIED",
      level === PermissionLevel.Execute
        ? "Executing a payment needs your explicit approval on the confirmation screen."
        : `This step needs permission level ${level}; your settings allow level ${profile.ai_permission_level}.`,
      { required_level: level, granted_level: profile.ai_permission_level },
    );
  }
}

export function transactionTypeFor(ob: Pick<Obligation, "kind">): "education" | "personal" {
  return ob.kind === "tuition" ? "education" : "personal";
}

/** The account that funds a cross-border payment: the user's home-currency account with the most money. */
export function pickSourceAccount(accounts: Account[], profile: Profile): Account | null {
  return [...accounts].filter((a) => a.currency === profile.home_currency).sort((a, b) => b.balance - a.balance)[0] ?? null;
}

export async function findObligation(repo: Repository, idOrKind: string): Promise<Obligation> {
  const obligations = await repo.listObligations();
  const ob = obligations.find((o) => o.id === idOrKind) ?? obligations.find((o) => o.kind === idOrKind && o.status !== "PAID");
  if (!ob) throw new DomainError("NOT_FOUND", `No obligation matches "${idOrKind}".`);
  return ob;
}

// ───────────────────────── Rules ─────────────────────────

export async function checkTransferRules(
  ctx: ActionContext,
  input: { source_country: CountryCode; destination_country: CountryCode; transaction_type: "education" | "personal"; source_amount: number; source_currency: Currency },
): Promise<ComplianceResult> {
  const [rules, profile, fx] = await Promise.all([ctx.repo.listCountryRules(), ctx.repo.getProfile(), getFxService(ctx.repo)]);
  const result = evaluateCompliance(rules, { ...input, documents_on_file: profile.documents_on_file, payer: payerOf(profile) }, fx);
  await audit(ctx, "TRANSFER_RULE_CHECK", {
    tool: "getTransferRules",
    level: PermissionLevel.Read,
    result: result.status === "BLOCKED" ? "BLOCKED" : "SUCCESS",
    details: {
      corridor: `${input.source_country}→${input.destination_country}`,
      transaction_type: input.transaction_type,
      amount: formatMoney(input.source_amount, input.source_currency),
      status: result.status,
      rules_checked: result.evaluations.map((e) => ({ id: e.rule.id, outcome: e.outcome })),
    },
  });
  return result;
}

export const payerOf = (p: Profile) => ({ nationality: p.nationality, residency_status: p.residency_status, visa_type: p.visa_type });

export async function listRulesForCorridor(repo: Repository, source: CountryCode, destination: CountryCode) {
  return matchRules(await repo.listCountryRules(), { source_country: source, destination_country: destination });
}

// ───────────────────────── Quotes ─────────────────────────

export interface CostComparison {
  comparison: QuoteComparison;
  /** Common send amount used for a like-for-like comparison. */
  compare_amount: number;
  /** For each provider, the exact send amount needed for the recipient to get destination_amount. */
  delivery_quotes: RemittanceQuote[];
  destination_amount: number | null;
  market_fx_rate: number;
  fx_as_of: string;
  fx_source: string;
}

export interface QuoteSet {
  quotes: RemittanceQuote[];
  compare_amount: number;
  delivery_quotes: RemittanceQuote[];
  destination_amount: number | null;
  market_fx_rate: number;
  fx_as_of: string;
  fx_source: string;
}

export interface QuoteRequest {
  source_currency: Currency;
  destination_currency: Currency;
  source_amount?: number;
  destination_amount?: number;
}

/**
 * Deterministic quote set: every provider at a common send amount (for a like-for-like
 * comparison, rounded up to the nearest 100) plus, when a destination amount is given,
 * the exact send amount each provider needs for the recipient to receive it.
 */
export async function buildQuoteSet(repo: Repository, input: QuoteRequest): Promise<QuoteSet> {
  const [providers, fx] = await Promise.all([repo.listProviders(), getFxService(repo)]);
  const market = fx.rate(input.source_currency, input.destination_currency);
  const compareAmount = input.source_amount ?? Math.ceil((input.destination_amount ?? 1000) / market / 100) * 100;
  const pair = { source_currency: input.source_currency, destination_currency: input.destination_currency };
  return {
    quotes: providers.map((p) => quoteForSourceAmount(p, { ...pair, source_amount: compareAmount }, fx)),
    delivery_quotes: input.destination_amount
      ? providers.map((p) => quoteForDestinationAmount(p, { ...pair, destination_amount: input.destination_amount! }, fx))
      : [],
    compare_amount: compareAmount,
    destination_amount: input.destination_amount ?? null,
    market_fx_rate: market,
    fx_as_of: fx.asOf,
    fx_source: fx.source,
  };
}

/** Tool: getRemittanceQuotes. Retrieves and stores provider quotes. */
export async function getRemittanceQuotes(ctx: ActionContext, input: QuoteRequest): Promise<QuoteSet> {
  const set = await buildQuoteSet(ctx.repo, input);
  await ctx.repo.saveQuotes([...set.quotes, ...set.delivery_quotes]);
  await audit(ctx, "QUOTE_RETRIEVAL", {
    tool: "getRemittanceQuotes",
    level: PermissionLevel.Read,
    details: {
      pair: `${input.source_currency}/${input.destination_currency}`,
      compare_amount: formatMoney(set.compare_amount, input.source_currency),
      providers: set.quotes.map((q) => ({ provider: q.provider_name, recipient_gets: q.estimated_recipient_amount, total_cost: q.total_cost, available: q.available })),
    },
  });
  return set;
}

export interface CostComparison extends QuoteSet {
  comparison: QuoteComparison;
}

/** Tool: calculateTransferCost. Total cost per route, ranked by what the recipient receives. */
export async function calculateTransferCost(ctx: ActionContext, input: QuoteRequest): Promise<CostComparison> {
  const set = await buildQuoteSet(ctx.repo, input);
  const comparison = compareQuotes(set.quotes);
  await audit(ctx, "COST_CALCULATION", {
    tool: "calculateTransferCost",
    level: PermissionLevel.Information,
    details: {
      method: "total_cost = transfer_fee + fx_spread_cost + other_charges; ranked by recipient amount",
      best_value: comparison.best?.provider_name ?? null,
      lowest_advertised_fee: comparison.lowest_advertised_fee?.provider_name ?? null,
      ranking: comparison.quotes.map((q) => `${q.provider_name}: ${formatMoney(q.estimated_recipient_amount, q.destination_currency)}`),
    },
  });
  return { ...set, comparison };
}

// ───────────────────────── Prepare ─────────────────────────

export async function createTransferInstruction(
  ctx: ActionContext,
  input: { obligation_id: string; provider_id: string; source_account_id?: string },
): Promise<TransferRequest> {
  const profile = await ctx.repo.getProfile();
  await assertPermission(ctx, profile, PermissionLevel.Prepare, "createTransferInstruction");

  const reject = async (code: DomainError["code"], message: string, details: Record<string, unknown> = {}) => {
    await audit(ctx, "TRANSFER_REJECTED", { tool: "createTransferInstruction", level: PermissionLevel.Prepare, result: "BLOCKED", details: { reason: code, message, ...details } });
    return new DomainError(code, message, details);
  };

  const [obligation, accounts, providers, fx] = await Promise.all([
    findObligation(ctx.repo, input.obligation_id),
    ctx.repo.listAccounts(),
    ctx.repo.listProviders(),
    getFxService(ctx.repo),
  ]);
  if (obligation.status === "PAID") throw await reject("INVALID_STATE", `${obligation.title} is already paid.`);
  const provider = providers.find((p) => p.id === input.provider_id || p.name === input.provider_id);
  if (!provider) throw await reject("NOT_FOUND", `Unknown provider "${input.provider_id}".`);
  const account = input.source_account_id ? accounts.find((a) => a.id === input.source_account_id) : pickSourceAccount(accounts, profile);
  if (!account) throw await reject("NOT_FOUND", "No funding account in your home currency.");

  const quote = quoteForDestinationAmount(
    provider,
    { source_currency: account.currency, destination_currency: obligation.currency, destination_amount: obligation.amount },
    fx,
  );
  if (account.balance < quote.source_amount) {
    throw await reject("INSUFFICIENT_FUNDS", `${account.name} holds ${formatMoney(account.balance, account.currency)}; this transfer needs ${formatMoney(quote.source_amount, account.currency)}.`, {
      available: account.balance,
      required: quote.source_amount,
      shortfall: roundMoney(quote.source_amount - account.balance, account.currency),
    });
  }

  // Compliance is re-evaluated here on the server; the agent's earlier check is not trusted.
  const compliance = await checkTransferRules(ctx, {
    source_country: account.country,
    destination_country: obligation.destination_country,
    transaction_type: transactionTypeFor(obligation),
    source_amount: quote.source_amount,
    source_currency: account.currency,
  });
  if (compliance.status === "BLOCKED") {
    throw await reject("COMPLIANCE_BLOCKED", "This transfer breaks a transfer rule and cannot be prepared.", {
      blocking_rules: compliance.evaluations.filter((e) => e.outcome === "BLOCK").map((e) => e.rule.rule_name),
    });
  }
  if (compliance.status === "ACTION_REQUIRED") {
    throw await reject("COMPLIANCE_ACTION_REQUIRED", "Documents are missing for this transfer.", {
      missing_documents: compliance.required_documents.filter((d) => !d.on_file).map((d) => d.name),
    });
  }

  if (!quote.available) throw await reject("PROVIDER_UNAVAILABLE", quote.unavailable_reason ?? "Provider unavailable.");

  await ctx.repo.saveQuotes([quote]);
  const now = new Date();
  const tr: TransferRequest = {
    id: randomUUID(),
    user_id: ctx.repo.userId,
    obligation_id: obligation.id,
    source_account_id: account.id,
    provider_id: provider.id,
    quote_id: quote.id,
    recipient: obligation.payee,
    recipient_country: obligation.destination_country,
    purpose: obligation.purpose,
    invoice_ref: obligation.invoice_ref,
    source_amount: quote.source_amount,
    source_currency: account.currency,
    destination_amount: quote.estimated_recipient_amount,
    destination_currency: obligation.currency,
    provider_fx_rate: quote.provider_fx_rate,
    market_fx_rate: quote.market_fx_rate,
    transfer_fee: quote.transfer_fee,
    total_cost: quote.total_cost,
    estimated_settlement_date: addBusinessDays(now, provider.settlement_business_days).toISOString().slice(0, 10),
    compliance_status: compliance.status,
    compliance_snapshot: compliance,
    required_documents: compliance.required_documents,
    status: "PENDING_APPROVAL",
    prepared_by: ctx.actor === "ai_agent" ? "ai_agent" : "user",
    approved_at: null,
    approval_ack: false,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + TRANSFER_REQUEST_TTL_MINUTES * 60_000).toISOString(),
  };
  await ctx.repo.createTransferRequest(tr);
  await audit(ctx, "TRANSFER_PREPARED", {
    tool: "createTransferInstruction",
    level: PermissionLevel.Prepare,
    approval: "PENDING",
    details: {
      transfer_request_id: tr.id,
      obligation: `${obligation.title} (${obligation.invoice_ref})`,
      provider: provider.name,
      source: `${account.name} ****${account.account_last4}`,
      send: formatMoney(tr.source_amount, tr.source_currency),
      recipient_gets: formatMoney(tr.destination_amount, tr.destination_currency),
      compliance: compliance.status,
      expires_at: tr.expires_at,
    },
  });
  return tr;
}

// ───────────────────────── Approve / decline ─────────────────────────

export async function approveTransfer(ctx: ActionContext, input: { transfer_request_id: string; acknowledged: boolean }) {
  if (ctx.actor !== "user") {
    throw new DomainError("APPROVAL_REQUIRED", "Only the account holder can approve a transfer.");
  }
  if (input.acknowledged !== true) {
    throw new DomainError("APPROVAL_REQUIRED", "Tick “I have reviewed this transaction” before confirming.");
  }
  const tr = await ctx.repo.getTransferRequest(input.transfer_request_id);
  if (!tr) throw new DomainError("NOT_FOUND", "Transfer request not found.");
  if (new Date(tr.expires_at).getTime() < Date.now() && tr.status === "PENDING_APPROVAL") {
    await ctx.repo.transitionTransferRequest(tr.id, ["PENDING_APPROVAL"], { status: "CANCELLED" });
    throw new DomainError("EXPIRED", "This quote has expired. Ask CaiMao to prepare the transfer again.");
  }
  if (tr.compliance_status !== "COMPLIANT") throw new DomainError("COMPLIANCE_BLOCKED", "This transfer is not compliant.");
  const approved = await ctx.repo.transitionTransferRequest(tr.id, ["PENDING_APPROVAL"], {
    status: "APPROVED",
    approval_ack: true,
    approved_at: new Date().toISOString(),
  });
  if (!approved) throw new DomainError("INVALID_STATE", `Transfer is ${tr.status.toLowerCase().replace("_", " ")} and cannot be approved.`);
  await audit(ctx, "USER_APPROVAL", {
    tool: "confirmationScreen",
    level: PermissionLevel.Execute,
    approval: "APPROVED",
    actor: "user",
    details: { transfer_request_id: tr.id, acknowledgement: "I have reviewed this transaction.", amount: formatMoney(tr.source_amount, tr.source_currency) },
  });
  return approved;
}

export async function declineTransfer(ctx: ActionContext, transferRequestId: string) {
  const tr = await ctx.repo.transitionTransferRequest(transferRequestId, ["PENDING_APPROVAL"], { status: "CANCELLED" });
  if (!tr) throw new DomainError("INVALID_STATE", "Only transfers awaiting approval can be cancelled.");
  await audit(ctx, "USER_DECLINED", {
    tool: "confirmationScreen",
    level: PermissionLevel.Execute,
    approval: "DECLINED",
    actor: "user",
    details: { transfer_request_id: tr.id, note: "No money moved." },
  });
  return tr;
}

// ───────────────────────── Execute ─────────────────────────

export interface ExecutionOutcome {
  transaction_id: string;
  status: "COMPLETED";
  timestamp: string;
  provider: string;
  source_amount: number;
  source_currency: Currency;
  destination_amount: number;
  destination_currency: Currency;
  fee: number;
  recipient: string;
  new_balance: number;
  account: string;
  obligation_status: "PAID" | null;
  provider_reference: string;
}

/**
 * Runs only for a request the user approved. Order: verify approval → call the
 * sandbox rail → commit ledger changes atomically → audit each change.
 */
export async function executeSandboxTransfer(ctx: ActionContext, transferRequestId: string): Promise<ExecutionOutcome> {
  const tr = await ctx.repo.getTransferRequest(transferRequestId);
  if (!tr) throw new DomainError("NOT_FOUND", "Transfer request not found.");
  if (tr.status !== "APPROVED" || !tr.approval_ack || !tr.approved_at) {
    await audit(ctx, "TRANSFER_FAILED", {
      tool: "executeSandboxTransfer",
      level: PermissionLevel.Execute,
      approval: tr.status === "PENDING_APPROVAL" ? "PENDING" : "NOT_REQUIRED",
      result: "BLOCKED",
      details: { transfer_request_id: tr.id, reason: "No user approval on record", status: tr.status },
    });
    throw new DomainError("APPROVAL_REQUIRED", "This transfer has not been approved, so nothing was sent.");
  }
  const executing = await ctx.repo.transitionTransferRequest(tr.id, ["APPROVED"], { status: "EXECUTING" });
  if (!executing) throw new DomainError("INVALID_STATE", "Transfer is already being executed.");

  const [providers, accounts] = await Promise.all([ctx.repo.listProviders(), ctx.repo.listAccounts()]);
  const provider = providers.find((p) => p.id === tr.provider_id)!;
  const account = accounts.find((a) => a.id === tr.source_account_id)!;

  const fail = async (reason: string, code: DomainError["code"] = "PAYMENT_FAILED") => {
    await ctx.repo.transitionTransferRequest(tr.id, ["EXECUTING", "APPROVED"], { status: "FAILED" });
    await audit(ctx, "TRANSFER_FAILED", {
      tool: "executeSandboxTransfer",
      level: PermissionLevel.Execute,
      approval: "APPROVED",
      result: "FAILURE",
      details: { transfer_request_id: tr.id, reason },
    });
    return new DomainError(code, reason);
  };

  if (account.balance < tr.source_amount) throw await fail(`${account.name} no longer has enough funds.`, "INSUFFICIENT_FUNDS");

  const rail = await submitSandboxPayment({
    transfer_request_id: tr.id,
    provider: provider.name,
    source_amount: tr.source_amount,
    source_currency: tr.source_currency,
    destination_amount: tr.destination_amount,
    destination_currency: tr.destination_currency,
    recipient: tr.recipient,
    reference: tr.invoice_ref,
  });
  if (!rail.ok) throw await fail(rail.reason);

  let committed;
  try {
    committed = await ctx.repo.commitExecution({
      userId: ctx.repo.userId,
      transferRequestId: tr.id,
      execution: {
        user_id: ctx.repo.userId,
        transfer_request_id: tr.id,
        status: "COMPLETED",
        timestamp: rail.accepted_at,
        provider: provider.name,
        source_amount: tr.source_amount,
        source_currency: tr.source_currency,
        destination_amount: tr.destination_amount,
        destination_currency: tr.destination_currency,
        fee: tr.transfer_fee,
        recipient: tr.recipient,
        failure_reason: null,
      },
      debit: { accountId: account.id, amount: tr.source_amount },
      ledgerEntry: {
        user_id: ctx.repo.userId,
        account_id: account.id,
        date: rail.accepted_at.slice(0, 10),
        description: tr.invoice_ref ? `${tr.purpose} — ${tr.recipient} (${tr.invoice_ref})` : `${tr.purpose} — ${tr.recipient}`,
        merchant: `${provider.name} transfer`,
        amount: -tr.source_amount,
        currency: tr.source_currency,
        category: tr.purpose.startsWith("Education") ? "Education" : "Transfers",
        category_source: "system",
      },
      obligationId: tr.obligation_id,
    });
  } catch (e) {
    const msg = e instanceof RepositoryError ? e.message : "Ledger update failed.";
    throw await fail(msg, e instanceof RepositoryError && e.code === "INSUFFICIENT_FUNDS" ? "INSUFFICIENT_FUNDS" : "PAYMENT_FAILED");
  }

  const { execution, newBalance } = committed;
  await audit(ctx, "TRANSFER_EXECUTED", {
    tool: "executeSandboxTransfer",
    level: PermissionLevel.Execute,
    approval: "APPROVED",
    details: {
      transaction_id: execution.transaction_id,
      provider_reference: rail.provider_reference,
      provider: provider.name,
      sent: formatMoney(tr.source_amount, tr.source_currency),
      received: formatMoney(tr.destination_amount, tr.destination_currency),
      recipient: tr.recipient,
      environment: "sandbox",
    },
  });
  await audit(ctx, "BALANCE_UPDATED", {
    tool: "updateAccountBalance",
    level: PermissionLevel.Execute,
    approval: "APPROVED",
    details: {
      account: `${account.name} ****${account.account_last4}`,
      before: formatMoney(account.balance, account.currency),
      change: formatMoney(-tr.source_amount, account.currency),
      after: formatMoney(newBalance, account.currency),
      transaction_id: execution.transaction_id,
    },
  });
  if (tr.obligation_id) {
    await audit(ctx, "OBLIGATION_PAID", {
      tool: "markObligationPaid",
      level: PermissionLevel.Execute,
      approval: "APPROVED",
      details: { obligation_id: tr.obligation_id, invoice: tr.invoice_ref, transaction_id: execution.transaction_id, status: "PAID" },
    });
  }

  return {
    transaction_id: execution.transaction_id,
    status: "COMPLETED",
    timestamp: execution.timestamp,
    provider: execution.provider,
    source_amount: execution.source_amount,
    source_currency: execution.source_currency,
    destination_amount: execution.destination_amount,
    destination_currency: execution.destination_currency,
    fee: execution.fee,
    recipient: execution.recipient,
    new_balance: newBalance,
    account: `${account.name} ****${account.account_last4}`,
    obligation_status: tr.obligation_id ? "PAID" : null,
    provider_reference: rail.provider_reference,
  };
}
