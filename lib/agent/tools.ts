import { z } from "zod";
import type { ActionContext } from "../audit";
import { audit } from "../audit";
import { PermissionLevel, CURRENCIES, type CountryCode } from "../types";
import { formatMoney, formatRate, roundMoney } from "../fx/service";
import {
  assertPermission,
  calculateTransferCost,
  checkTransferRules,
  createTransferInstruction,
  getFxService,
  getRemittanceQuotes,
  listRulesForCorridor,
} from "../finance";
import { summarizeBudget } from "../budget/insights";
import type { AgentCard, Phase } from "./protocol";
import { GLOBAL_TOOLS } from "./tools-global";

/**
 * Tool registry. Every financial fact the agent states comes from one of these.
 * Each tool declares its permission level; the registry enforces it before running.
 * Tools marked `llm: false` are never offered to the model.
 */

export interface ToolResult {
  /** Compact JSON returned to the model. */
  data: unknown;
  /** One line for the visible step trace. */
  summary: string;
  /** UI cards built from the result (never from model text). */
  cards?: AgentCard[];
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  level: PermissionLevel;
  phase: Phase;
  loading: string;
  llm: boolean;
  schema: S;
  run(ctx: ActionContext, input: z.infer<S>): Promise<ToolResult>;
}

const currency = z.enum(CURRENCIES);
const country = z.enum(["SG", "GB", "CN", "VN", "HK", "US"]);

export const daysUntil = (isoDate: string, now = new Date()) => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((new Date(isoDate + "T00:00:00Z").getTime() - today) / 86_400_000);
};

export const def = <S extends z.ZodType>(d: ToolDef<S>) => d;

const CORE_TOOLS = [
  def({
    name: "getUserProfile",
    description: "Get the user's profile: name, home and study countries, currencies, university, AI permission level and documents on file.",
    level: PermissionLevel.Read,
    phase: "Understand",
    loading: "Reading your profile…",
    llm: true,
    schema: z.object({}),
    async run(ctx) {
      const p = await ctx.repo.getProfile();
      await audit(ctx, "PROFILE_READ", { tool: "getUserProfile" });
      const { email: _email, ...safe } = p;
      return { data: safe, summary: `${p.full_name} · studies in ${p.study_country} · home currency ${p.home_currency}` };
    },
  }),
  def({
    name: "getAccounts",
    description: "Get the user's accounts with balances (account numbers are masked) and the total in the base currency.",
    level: PermissionLevel.Read,
    phase: "Analyse",
    loading: "Retrieving account balances…",
    llm: true,
    schema: z.object({}),
    async run(ctx) {
      const [accounts, profile, fx] = await Promise.all([ctx.repo.listAccounts(), ctx.repo.getProfile(), getFxService(ctx.repo)]);
      const total = roundMoney(accounts.reduce((s, a) => s + fx.convert(a.balance, a.currency, profile.base_currency), 0), profile.base_currency);
      await audit(ctx, "ACCOUNTS_READ", { tool: "getAccounts", details: { accounts: accounts.length } });
      return {
        data: {
          accounts: accounts.map((a) => ({ id: a.id, name: a.name, masked: `****${a.account_last4}`, country: a.country, currency: a.currency, balance: a.balance })),
          total_in_base: total,
          base_currency: profile.base_currency,
        },
        summary: accounts.map((a) => `${a.name} ${formatMoney(a.balance, a.currency)}`).join(" · "),
        cards: [{ kind: "accounts", accounts, total, base_currency: profile.base_currency }],
      };
    },
  }),
  def({
    name: "getTransactions",
    description: "Get a spending summary for the last 30 days (income, expenses, savings, category breakdown vs three-month average, upcoming obligations) plus recent transactions.",
    level: PermissionLevel.Read,
    phase: "Analyse",
    loading: "Reviewing your transactions…",
    llm: true,
    schema: z.object({ limit: z.number().int().min(1).max(40).optional() }),
    async run(ctx, input) {
      const [transactions, accounts, obligations, budgets, profile, fx] = await Promise.all([
        ctx.repo.listTransactions(),
        ctx.repo.listAccounts(),
        ctx.repo.listObligations(),
        ctx.repo.listBudgets(),
        ctx.repo.getProfile(),
        getFxService(ctx.repo),
      ]);
      const summary = summarizeBudget({ transactions, accounts, obligations, budgets, fx, currency: profile.study_currency });
      await audit(ctx, "TRANSACTIONS_READ", { tool: "getTransactions", details: { transactions: transactions.length } });
      return {
        data: { summary, recent: transactions.slice(0, input.limit ?? 12).map(({ user_id: _u, ...t }) => t) },
        summary: `${transactions.length} transactions · spent ${formatMoney(summary.expenses, summary.currency)} in 30 days`,
        cards: [{ kind: "spending", summary }],
      };
    },
  }),
  def({
    name: "getObligations",
    description: "Get upcoming and paid obligations (tuition, rent, card payments) with amount, currency, due date, payee, invoice and status.",
    level: PermissionLevel.Read,
    phase: "Understand",
    loading: "Checking upcoming obligations…",
    llm: true,
    schema: z.object({ focus: z.enum(["tuition", "rent", "card", "other"]).optional() }),
    async run(ctx, input) {
      const obligations = (await ctx.repo.listObligations()).map((o) => ({ ...o, days_until: daysUntil(o.due_date) }));
      await audit(ctx, "OBLIGATIONS_READ", { tool: "getObligations" });
      const focus = input.focus ? obligations.find((o) => o.kind === input.focus && o.status !== "PAID") ?? obligations.find((o) => o.kind === input.focus) : null;
      return {
        data: obligations.map(({ user_id: _u, ...o }) => o),
        summary: focus
          ? `${focus.title} ${formatMoney(focus.amount, focus.currency)} · ${focus.status === "PAID" ? "paid" : `due in ${focus.days_until} days`}`
          : `${obligations.filter((o) => o.status !== "PAID").length} unpaid obligations`,
        cards: [{ kind: "obligations", obligations, focus_id: focus?.id ?? null }],
      };
    },
  }),
  def({
    name: "getFXRate",
    description: "Get the mid-market FX rate between two currencies from CaiMao's central FX service.",
    level: PermissionLevel.Information,
    phase: "Analyse",
    loading: "Fetching the mid-market rate…",
    llm: true,
    schema: z.object({ from: currency, to: currency }),
    async run(ctx, input) {
      const fx = await getFxService(ctx.repo);
      const rate = fx.rate(input.from, input.to);
      await audit(ctx, "FX_RATE_READ", { tool: "getFXRate", level: PermissionLevel.Information, details: { pair: `${input.from}/${input.to}`, rate } });
      return {
        data: { from: input.from, to: input.to, mid_market_rate: rate, as_of: fx.asOf, source: fx.source },
        summary: `1 ${input.from} = ${formatRate(rate)} ${input.to} (mid-market)`,
      };
    },
  }),
  def({
    name: "getTransferRules",
    description:
      "Retrieve cross-border transfer rules for a corridor from the regulatory database. With an amount, evaluates them and returns COMPLIANT, ACTION_REQUIRED or BLOCKED with required documents. Never state a rule that this tool did not return.",
    level: PermissionLevel.Read,
    phase: "Check compliance",
    loading: "Checking transfer requirements…",
    llm: true,
    schema: z.object({
      source_country: country,
      destination_country: country,
      transaction_type: z.enum(["education", "personal"]).default("personal"),
      amount: z.number().positive().optional(),
      currency: currency.optional(),
    }),
    async run(ctx, input) {
      const corridor = `${input.source_country}→${input.destination_country}`;
      if (input.amount && input.currency) {
        const result = await checkTransferRules(ctx, {
          source_country: input.source_country as CountryCode,
          destination_country: input.destination_country as CountryCode,
          transaction_type: input.transaction_type,
          source_amount: input.amount,
          source_currency: input.currency,
        });
        return {
          data: {
            status: result.status,
            coverage: result.coverage,
            rules: result.evaluations.map((e) => ({
              rule_name: e.rule.rule_name,
              outcome: e.outcome,
              message: e.message,
              risk_level: e.rule.risk_level,
              official_source: e.rule.official_source,
              last_verified: e.rule.last_verified,
              is_demo_data: e.rule.is_demo,
            })),
            required_documents: result.required_documents,
          },
          summary: `${corridor}: ${result.evaluations.length} rules checked · ${result.status}`,
          cards: [{ kind: "compliance", result }],
        };
      }
      const rules = await listRulesForCorridor(ctx.repo, input.source_country as CountryCode, input.destination_country as CountryCode);
      await audit(ctx, "TRANSFER_RULE_CHECK", { tool: "getTransferRules", details: { corridor, rules: rules.map((r) => r.id), mode: "lookup" } });
      return {
        data: rules.map((r) => ({
          rule_name: r.rule_name,
          description: r.rule_description,
          transaction_type: r.transaction_type,
          limit: r.limit_amount != null && r.currency ? `${r.currency} ${r.limit_amount}` : null,
          documentation_required: r.documentation_required,
          risk_level: r.risk_level,
          official_source: r.official_source,
          last_verified: r.last_verified,
          is_demo_data: r.is_demo,
        })),
        summary: `${corridor}: ${rules.length} rules on record`,
        cards: [{ kind: "rules", rules, corridor }],
      };
    },
  }),
  def({
    name: "getRemittanceQuotes",
    description:
      "Get simulated quotes from every remittance provider for a currency pair. Give destination_amount when the recipient must receive an exact amount (e.g. an invoice), or source_amount for a fixed send amount.",
    level: PermissionLevel.Read,
    phase: "Compare",
    loading: "Retrieving FX quotes…",
    llm: true,
    schema: z.object({
      source_currency: currency,
      destination_currency: currency,
      source_amount: z.number().positive().optional(),
      destination_amount: z.number().positive().optional(),
    }),
    async run(ctx, input) {
      const set = await getRemittanceQuotes(ctx, input);
      return {
        data: {
          compare_amount: set.compare_amount,
          quotes: set.quotes.map((q) => ({
            provider_name: q.provider_name,
            provider_id: q.provider_id,
            source_currency: q.source_currency,
            destination_currency: q.destination_currency,
            market_fx_rate: q.market_fx_rate,
            provider_fx_rate: q.provider_fx_rate,
            transfer_fee: q.transfer_fee,
            estimated_recipient_amount: q.estimated_recipient_amount,
            settlement_time: q.settlement_time,
            available: q.available,
          })),
        },
        summary: `${set.quotes.length} providers quoted at ${formatMoney(set.compare_amount, input.source_currency)}`,
      };
    },
  }),
  def({
    name: "calculateTransferCost",
    description:
      "Calculate the true total cost of each route (transfer fee + FX spread cost + other charges) and rank providers by the amount the recipient actually receives. Returns the best-value provider and the reasoning.",
    level: PermissionLevel.Information,
    phase: "Compare",
    loading: "Comparing total costs…",
    llm: true,
    schema: z.object({
      source_currency: currency,
      destination_currency: currency,
      source_amount: z.number().positive().optional(),
      destination_amount: z.number().positive().optional(),
    }),
    async run(ctx, input) {
      const c = await calculateTransferCost(ctx, input);
      const cmp = c.comparison;
      return {
        data: {
          compare_amount: c.compare_amount,
          ranking: cmp.quotes.map((q, i) => ({
            rank: q.available ? i + 1 : null,
            provider_id: q.provider_id,
            provider_name: q.provider_name,
            fx_spread_pct: q.fx_spread_pct,
            transfer_fee: q.transfer_fee,
            fx_spread_cost: q.fx_spread_cost,
            other_charges: q.other_charges,
            total_cost: q.total_cost,
            recipient_gets: q.estimated_recipient_amount,
            settlement_time: q.settlement_time,
            available: q.available,
          })),
          send_needed_to_deliver_destination_amount: c.delivery_quotes.map((q) => ({ provider_name: q.provider_name, send_amount: q.source_amount })),
          best_value_provider_id: cmp.best?.provider_id ?? null,
          best_value_provider: cmp.best?.provider_name ?? null,
          explanation: cmp.explanation,
          is_estimate: true,
        },
        summary: cmp.best ? `Best value: ${cmp.best.provider_name} · recipient gets ${formatMoney(cmp.best.estimated_recipient_amount, cmp.best.destination_currency)}` : "No provider available",
        cards: [
          {
            kind: "quotes",
            quotes: cmp.quotes,
            delivery_quotes: c.delivery_quotes,
            best_provider_id: cmp.best?.provider_id ?? null,
            lowest_fee_provider_id: cmp.lowest_advertised_fee?.provider_id ?? null,
            compare_amount: c.compare_amount,
            destination_amount: c.destination_amount,
            explanation: cmp.explanation,
            explanation_parts: cmp.explanation_parts,
            advantage_vs: cmp.advantage_vs,
            fx_as_of: c.fx_as_of,
            fx_source: c.fx_source,
          },
        ],
      };
    },
  }),
  def({
    name: "createTransferInstruction",
    description:
      "Prepare (not send) a transfer instruction to pay an obligation through a chosen provider. The server re-checks balance and compliance. The result awaits the user's explicit approval on a confirmation screen; you cannot approve or execute it.",
    level: PermissionLevel.Prepare,
    phase: "Obtain approval",
    loading: "Preparing transfer…",
    llm: true,
    schema: z.object({ obligation_id: z.string(), provider_id: z.string(), source_account_id: z.string().optional() }),
    async run(ctx, input) {
      const tr = await createTransferInstruction(ctx, input);
      const [providers, accounts, obligations] = await Promise.all([ctx.repo.listProviders(), ctx.repo.listAccounts(), ctx.repo.listObligations()]);
      const provider = providers.find((p) => p.id === tr.provider_id)!;
      const account = accounts.find((a) => a.id === tr.source_account_id)!;
      const obligation = obligations.find((o) => o.id === tr.obligation_id) ?? null;
      return {
        data: {
          transfer_request_id: tr.id,
          status: tr.status,
          send: formatMoney(tr.source_amount, tr.source_currency),
          recipient_gets: formatMoney(tr.destination_amount, tr.destination_currency),
          provider: provider.name,
          expires_at: tr.expires_at,
          note: "Awaiting the user's approval on the confirmation screen. Nothing has been sent.",
        },
        summary: `Instruction ready · ${formatMoney(tr.source_amount, tr.source_currency)} via ${provider.name} · PENDING APPROVAL`,
        cards: [{ kind: "instruction", request: tr, provider_name: provider.name, account_label: `${account.name} ****${account.account_last4}`, obligation_title: obligation?.title ?? null }],
      };
    },
  }),
  def({
    name: "getCreditSummary",
    description: "Get the user's local credit card: limit, balance, utilisation, next payment due and recent payment history.",
    level: PermissionLevel.Read,
    phase: "Analyse",
    loading: "Reviewing your credit card…",
    llm: true,
    schema: z.object({}),
    async run(ctx) {
      const [card] = await ctx.repo.listCreditCards();
      await audit(ctx, "ACCOUNTS_READ", { tool: "getCreditSummary", details: { cards: card ? 1 : 0 } });
      if (!card) return { data: null, summary: "No credit card on file" };
      const utilisation = card.current_balance / card.credit_limit;
      const due = daysUntil(card.payment_due_date);
      return {
        data: { ...card, utilisation, days_until_due: due },
        summary: `Utilisation ${(utilisation * 100).toFixed(1)}% · payment due in ${due} days`,
        cards: [{ kind: "credit", card, utilisation, days_until_due: due }],
      };
    },
  }),
  def({
    name: "getBankSetupChecklist",
    description: "Get the informational checklist for opening a local bank account in a country (defaults to the study country).",
    level: PermissionLevel.Information,
    phase: "Understand",
    loading: "Loading the account-opening checklist…",
    llm: true,
    schema: z.object({ country: country.optional() }),
    async run(ctx, input) {
      const [items, profile] = await Promise.all([ctx.repo.listChecklist(), ctx.repo.getProfile()]);
      const c = input.country ?? profile.study_country;
      const list = items.filter((i) => i.country === c);
      return {
        data: list.map((i) => ({ label: i.label, detail: i.detail, completed: i.completed })),
        summary: `${list.filter((i) => i.completed).length} of ${list.length} items complete`,
        cards: [{ kind: "checklist", country: c, items: list }],
      };
    },
  }),
];

export const TOOLS = [...CORE_TOOLS, ...GLOBAL_TOOLS];

/** Steps that run only inside the approved execution pipeline. Listed for the trace and the README. */
export const SYSTEM_TOOLS = [
  { name: "executeSandboxTransfer", level: PermissionLevel.Execute, phase: "Execute" as Phase, loading: "Executing sandbox transfer…" },
  { name: "updateAccountBalance", level: PermissionLevel.Execute, phase: "Verify" as Phase, loading: "Updating balances…" },
  { name: "markObligationPaid", level: PermissionLevel.Execute, phase: "Verify" as Phase, loading: "Marking the obligation paid…" },
  { name: "createAuditLog", level: PermissionLevel.Execute, phase: "Verify" as Phase, loading: "Writing the audit log…" },
  // Statement pipeline: runs only on a user's upload with explicit consent (POST /api/statements), never on the agent's initiative.
  { name: "parseBankStatement", level: PermissionLevel.Read, phase: "Analyse" as Phase, loading: "Reading your statement…" },
  { name: "classifyTransactions", level: PermissionLevel.Read, phase: "Analyse" as Phase, loading: "Sorting transactions into categories…" },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

/** Validates input, enforces the permission level, runs the tool. */
export async function runTool(ctx: ActionContext, name: string, rawInput: unknown): Promise<ToolResult> {
  const tool = toolByName(name);
  if (!tool) throw new Error(`Unknown tool ${name}. Executing payments is not available to the agent.`);
  const profile = await ctx.repo.getProfile();
  await assertPermission(ctx, profile, tool.level, tool.name);
  const input = tool.schema.parse(rawInput ?? {});
  return tool.run(ctx, input as never);
}

export function llmToolSpecs() {
  return TOOLS.filter((t) => t.llm).map((t) => ({
    name: t.name,
    description: `${t.description} (Permission level ${t.level}.)`,
    input_schema: z.toJSONSchema(t.schema, { target: "draft-7" }) as { type: "object"; [k: string]: unknown },
  }));
}
