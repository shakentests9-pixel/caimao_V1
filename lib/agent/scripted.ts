import { randomUUID } from "node:crypto";
import type { Repository } from "../data/repository";
import type { ActionContext } from "../audit";
import { DomainError, pickSourceAccount } from "../finance";
import { formatMoney, formatRate } from "../fx/service";
import { COUNTRY_CURRENCY, COUNTRY_NAMES, type ComplianceResult, type CountryCode, type Currency, type Obligation, type Profile } from "../types";
import type { BudgetSummary } from "../budget/insights";
import { runTool, toolByName, type ToolResult } from "./tools";
import type { AgentCard, AgentEvent, ChatMessage } from "./protocol";

export type Emit = (e: AgentEvent) => void;

export interface ToolCallOutcome {
  ok: boolean;
  result?: ToolResult;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

/** Runs one tool with visible start/end events and emits its cards. Errors become data, not crashes. */
export async function invokeTool(ctx: ActionContext, emit: Emit, name: string, input: unknown = {}, opts: { cards?: boolean } = {}): Promise<ToolCallOutcome> {
  const tool = toolByName(name);
  const id = randomUUID();
  const level = tool?.level ?? 0;
  const phase = tool?.phase ?? "Analyse";
  emit({ type: "tool_start", id, tool: name, label: tool?.loading ?? `Running ${name}…`, level, phase, input });
  try {
    const result = await runTool(ctx, name, input);
    emit({ type: "tool_end", id, tool: name, ok: true, summary: result.summary, level, phase });
    if (opts.cards !== false) for (const card of result.cards ?? []) emit({ type: "card", card });
    return { ok: true, result };
  } catch (e) {
    const err =
      e instanceof DomainError
        ? { code: e.code, message: e.message, details: e.details }
        : { code: "TOOL_ERROR", message: e instanceof Error ? e.message : "Tool failed" };
    emit({ type: "tool_end", id, tool: name, ok: false, summary: err.message, level, phase });
    return { ok: false, error: err };
  }
}

// ───────────────────────── Intent parsing ─────────────────────────

type Intent =
  | "pay_obligation"
  | "prepare_payment"
  | "compare_fx"
  | "send_money"
  | "check_rules"
  | "spending"
  | "credit"
  | "bank_account"
  | "balances"
  | "why_not"
  | "help";

const COUNTRY_WORDS: [RegExp, CountryCode][] = [
  [/\b(china|chinese|prc|mainland)\b/, "CN"],
  [/\b(vietnam|viet nam|vietnamese)\b/, "VN"],
  [/\b(hong kong|hk)\b/, "HK"],
  [/\b(united states|usa|u\.s\.|america|us)\b/, "US"],
  [/\b(united kingdom|uk|u\.k\.|britain|england|gb)\b/, "GB"],
  [/\b(singapore|sg)\b/, "SG"],
];

export function parseCountries(text: string): CountryCode[] {
  const found: { c: CountryCode; i: number }[] = [];
  for (const [re, c] of COUNTRY_WORDS) {
    const m = text.match(re);
    if (m?.index != null) found.push({ c, i: m.index });
  }
  return found.sort((a, b) => a.i - b.i).map((f) => f.c);
}

function parseAmount(text: string): { amount: number; currency: Currency | null } | null {
  const m = text.match(/(usd|gbp|sgd|cny|hkd|vnd|£|\$|s\$)?\s?([\d,]+(?:\.\d+)?)\s?(k)?\s?(usd|gbp|sgd|cny|hkd|vnd)?/i);
  if (!m || !m[2]) return null;
  let amount = Number(m[2].replace(/,/g, ""));
  if (!amount) return null;
  if (m[3]) amount *= 1000;
  const sym = (m[1] || m[4] || "").toLowerCase();
  const currency = (sym === "£" ? "GBP" : sym === "$" ? "USD" : sym === "s$" ? "SGD" : sym ? sym.toUpperCase() : null) as Currency | null;
  return { amount, currency };
}

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(prepare|go ahead|proceed|set up the payment|yes,? (please|prepare|pay)|do it)\b/.test(t) && !/\bwhy\b/.test(t)) return "prepare_payment";
  if (/\bwhy (not|didn't|isn't)\b|\bwhy .*(home bank|cheapest|zero fee|no fee)/.test(t)) return "why_not";
  if (/\b(pay|settle)\b.*\b(tuition|fees?|rent|invoice|card|bill)\b|\btuition\b/.test(t)) return "pay_obligation";
  if (/\b(rule|regulat|complian|allowed|limit|document|legal|permitted)/.test(t)) return "check_rules";
  if (/\b(send|remit|transfer)\b.*\b(overseas|abroad|money|home)\b|\bsend money\b/.test(t)) return "send_money";
  if (/\b(compare|fx|exchange rate|rates?|quote|cheapest|transfer options|provider)\b/.test(t)) return "compare_fx";
  if (/\b(spend|spending|budget|expense|saving|afford)/.test(t)) return "spending";
  if (/\bcredit\b/.test(t)) return "credit";
  if (/\b(bank account|open (a|an)? ?(local )?(bank|account)|checklist)\b/.test(t)) return "bank_account";
  if (/\b(balance|how much (money|cash)|accounts?|total cash)\b/.test(t)) return "balances";
  return "help";
}

// ───────────────────────── Scripted planner ─────────────────────────

const ok = <T>(o: ToolCallOutcome) => o.result?.data as T;

/**
 * Deterministic planner. Runs the same tools as the LLM agent in a fixed,
 * auditable order and writes its narrative only from tool results. Used when
 * no model key is configured, and as a fallback when the model is unavailable.
 */
export async function runScripted(repo: Repository, messages: ChatMessage[], emit: Emit, correlationId: string) {
  const ctx: ActionContext = { repo, actor: "ai_agent", correlationId };
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const intent = detectIntent(last);
  const t = last.toLowerCase();

  switch (intent) {
    case "pay_obligation":
    case "prepare_payment":
      return payObligationFlow(ctx, emit, t, intent === "prepare_payment");
    case "why_not":
      return whyNotFlow(ctx, emit);
    case "compare_fx":
      return compareFlow(ctx, emit, t);
    case "send_money":
      return sendMoneyFlow(ctx, emit, t);
    case "check_rules":
      return rulesFlow(ctx, emit, t);
    case "spending": {
      const r = await invokeTool(ctx, emit, "getTransactions", {});
      if (!r.ok) return emit({ type: "text", text: r.error!.message });
      const s = ok<{ summary: BudgetSummary }>(r).summary;
      emit({
        type: "text",
        text:
          `Over the last 30 days you received **${formatMoney(s.income, s.currency)}** and spent **${formatMoney(s.expenses, s.currency)}** on everyday costs` +
          (s.obligations_paid > 0 ? `, plus **${formatMoney(s.obligations_paid, s.currency)}** in obligations paid through CaiMao` : "") +
          `, leaving **${formatMoney(s.savings, s.currency)}**. Transfers between your own accounts are left out.\n\n` +
          s.insights.map((i) => `- ${i}`).join("\n"),
      });
      return emit({ type: "suggestions", items: ["Pay my tuition", "Help me build credit"] });
    }
    case "credit": {
      const r = await invokeTool(ctx, emit, "getCreditSummary", {});
      const d = ok<{ utilisation: number; days_until_due: number; current_balance: number; credit_limit: number; currency: Currency; minimum_payment: number } | null>(r);
      if (!d) return emit({ type: "text", text: "There's no local credit card on file yet." });
      emit({
        type: "text",
        text:
          `Your card balance is **${formatMoney(d.current_balance, d.currency)}** on a **${formatMoney(d.credit_limit, d.currency)}** limit, which is **${(d.utilisation * 100).toFixed(1)}%** utilisation.\n\n` +
          `Your payment is due in ${d.days_until_due} days. Paying on time helps maintain a positive payment history. ` +
          `Paying the full statement balance, rather than the ${formatMoney(d.minimum_payment, d.currency)} minimum, also avoids interest.\n\n` +
          `This is general guidance. CaiMao can't predict changes to your credit score or the outcome of any application.`,
      });
      return emit({ type: "suggestions", items: ["Open a local bank account", "Review my spending"] });
    }
    case "bank_account": {
      const c = parseCountries(t)[0];
      const r = await invokeTool(ctx, emit, "getBankSetupChecklist", c ? { country: c } : {});
      const items = ok<{ label: string; completed: boolean }[]>(r) ?? [];
      const left = items.filter((i) => !i.completed).length;
      emit({
        type: "text",
        text: `Here's what banks usually ask for. You've completed ${items.length - left} of ${items.length} items. Tick items off on the Banking & Credit page as you gather them. This checklist is for information only; each bank sets its own requirements.`,
      });
      return;
    }
    case "balances": {
      const r = await invokeTool(ctx, emit, "getAccounts", {});
      const d = ok<{ total_in_base: number; base_currency: Currency }>(r);
      emit({ type: "text", text: `Across your accounts you hold about **${formatMoney(d.total_in_base, d.base_currency)}**, converted at CaiMao's mid-market demo rates.` });
      return emit({ type: "suggestions", items: ["Pay my tuition", "Review my spending"] });
    }
    default:
      emit({
        type: "text",
        text:
          "I can work through a payment end to end: find what's due, check your balances and the transfer rules, compare providers on what actually arrives, and prepare the transfer for your approval. I can also review your spending, explain your credit card and list what you need to open a local bank account.",
      });
      return emit({ type: "suggestions", items: ["Pay my tuition", "Compare FX rates", "Check transfer rules", "Review my spending"] });
  }
}

function providerFromText(t: string): string | null {
  if (/home bank/.test(t)) return "prov-home-bank";
  if (/panda/.test(t)) return "prov-panda-remit-demo";
  if (/wallet/.test(t)) return "prov-mc-wallet-demo";
  return null;
}

function kindFromText(t: string): Obligation["kind"] {
  if (/\brent\b/.test(t)) return "rent";
  if (/\bcard\b/.test(t)) return "card";
  return "tuition";
}

async function payObligationFlow(ctx: ActionContext, emit: Emit, t: string, prepare: boolean) {
  const kind = kindFromText(t);
  // On a follow-up "prepare" the analysis re-runs for safety, but its cards were already shown.
  const show = { cards: !prepare };

  emit({ type: "phase", phase: "Understand" });
  const profileRes = await invokeTool(ctx, emit, "getUserProfile", {});
  if (!profileRes.ok) return emit({ type: "text", text: profileRes.error!.message });
  const profile = ok<Omit<Profile, "email">>(profileRes);

  const oblRes = await invokeTool(ctx, emit, "getObligations", { focus: kind }, show);
  const obligations = ok<(Obligation & { days_until: number })[]>(oblRes) ?? [];
  const ob = obligations.find((o) => o.kind === kind && o.status !== "PAID");
  if (!ob) {
    const paid = obligations.find((o) => o.kind === kind && o.status === "PAID");
    return emit({
      type: "text",
      text: paid ? `Your ${paid.title.toLowerCase()} (${paid.invoice_ref}) is already paid. You can see the receipt on the Execution Evidence page.` : "I couldn't find an unpaid obligation of that kind.",
    });
  }
  if (ob.currency === profile.home_currency || ob.destination_country === profile.home_country) {
    return emit({ type: "text", text: `${ob.title} is a domestic payment in ${ob.currency}. In this prototype CaiMao prepares cross-border payments only.` });
  }
  if (ob.kind !== "tuition") {
    return emit({
      type: "text",
      text: `${ob.title} (${formatMoney(ob.amount, ob.currency)}) is due in ${ob.days_until} days and is paid from your ${ob.currency} account. In this prototype CaiMao prepares cross-border tuition payments; ask me to pay your tuition to see the full workflow.`,
    });
  }

  emit({ type: "phase", phase: "Analyse" });
  const accRes = await invokeTool(ctx, emit, "getAccounts", {}, show);
  const accounts = ok<{ accounts: { id: string; name: string; masked: string; country: CountryCode; currency: Currency; balance: number }[] }>(accRes).accounts;
  const source = pickSourceAccount(
    accounts.map((a) => ({ ...a, user_id: "", institution: "", account_last4: a.masked.slice(-4), kind: "bank" as const })),
    profile as Profile,
  );
  if (!source) return emit({ type: "text", text: `You have no ${profile.home_currency} account to fund this payment from.` });

  const fxRes = await invokeTool(ctx, emit, "getFXRate", { from: source.currency, to: ob.currency });
  const mid = ok<{ mid_market_rate: number }>(fxRes).mid_market_rate;
  const estimate = Math.round((ob.amount / mid) * 100) / 100;
  const sufficient = source.balance >= estimate;
  const fundsCard: AgentCard = {
    kind: "funds",
    sufficient,
    account: `${source.name} ****${source.account_last4}`,
    available: source.balance,
    required_estimate: estimate,
    currency: source.currency,
    note: `Estimate at the mid-market rate of ${formatRate(mid)}, before provider fees and FX spread.`,
  };
  if (!prepare || !sufficient) emit({ type: "card", card: fundsCard });
  if (!sufficient) {
    emit({
      type: "card",
      card: {
        kind: "blocked",
        title: "Not enough funds to prepare this payment",
        reason: `${source.name} ****${source.account_last4} holds ${formatMoney(source.balance, source.currency)}. Paying ${formatMoney(ob.amount, ob.currency)} needs about ${formatMoney(estimate, source.currency)} before fees.`,
        items: ["Top up your home account, or", "Ask the university about an instalment plan before the due date."],
      },
    });
    return emit({
      type: "text",
      text: `Your ${ob.title.toLowerCase()} of **${formatMoney(ob.amount, ob.currency)}** is due in ${ob.days_until} days, but ${source.name} holds **${formatMoney(source.balance, source.currency)}**, short of the roughly **${formatMoney(estimate, source.currency)}** needed. I haven't prepared a transfer. Once the account is topped up, ask me again.`,
    });
  }

  emit({ type: "phase", phase: "Check compliance" });
  const ruleRes = await invokeTool(ctx, emit, "getTransferRules", {
    source_country: source.country,
    destination_country: ob.destination_country,
    transaction_type: "education",
    amount: estimate,
    currency: source.currency,
  }, show);
  if (!ruleRes.ok) return emit({ type: "text", text: ruleRes.error!.message });
  const rules = ok<{ status: ComplianceResult["status"]; rules: { rule_name: string; outcome: string; message: string }[]; required_documents: { name: string; on_file: boolean }[] }>(ruleRes);
  if (rules.status === "BLOCKED") {
    const blocking = rules.rules.filter((r) => r.outcome === "BLOCK");
    emit({ type: "card", card: { kind: "blocked", title: "Transaction blocked", reason: "This transfer breaks a rule in the regulatory database, so I won't prepare it.", items: blocking.map((b) => `${b.rule_name}: ${b.message}`) } });
    return emit({
      type: "text",
      text: `I checked the ${COUNTRY_NAMES[source.country]} → ${COUNTRY_NAMES[ob.destination_country]} rules on record and this payment is **blocked**: ${blocking.map((b) => b.message).join(" ")} No transfer has been prepared. Splitting a payment to get around a limit isn't something I can help with; the university's finance office can advise on approved payment arrangements.`,
    });
  }
  if (rules.status === "ACTION_REQUIRED") {
    const missing = rules.required_documents.filter((d) => !d.on_file).map((d) => d.name);
    emit({ type: "card", card: { kind: "blocked", title: "Action required", reason: "Documents are missing for this transfer.", items: missing.length ? missing : ["No rules are on record for this corridor, so it can't be cleared."] } });
    return emit({ type: "text", text: `Before I can prepare this payment, add these documents in Settings: ${missing.join(", ")}.` });
  }

  emit({ type: "phase", phase: "Compare" });
  const quoteReq = { source_currency: source.currency, destination_currency: ob.currency, destination_amount: ob.amount };
  if (!prepare) await invokeTool(ctx, emit, "getRemittanceQuotes", quoteReq);
  const costRes = await invokeTool(ctx, emit, "calculateTransferCost", quoteReq, show);
  if (!costRes.ok) return emit({ type: "text", text: costRes.error!.message });
  const cost = ok<{
    compare_amount: number;
    best_value_provider_id: string | null;
    best_value_provider: string | null;
    explanation: string;
    ranking: { provider_name: string; recipient_gets: number; total_cost: number; transfer_fee: number; available: boolean }[];
    send_needed_to_deliver_destination_amount: { provider_name: string; send_amount: number }[];
  }>(costRes);
  if (!cost.best_value_provider_id) return emit({ type: "text", text: "None of the providers can take this transfer at this amount." });

  const chosenId = providerFromText(t) ?? cost.best_value_provider_id;
  const bestSend = cost.send_needed_to_deliver_destination_amount.find((d) => d.provider_name === cost.best_value_provider)!;

  emit({ type: "phase", phase: "Recommend" });
  if (!prepare) {
    const avail = cost.ranking.filter((r) => r.available);
    const best = avail.find((r) => r.provider_name === cost.best_value_provider)!;
    const worst = avail[avail.length - 1];
    const extra = worst && worst !== best ? best.recipient_gets - worst.recipient_gets : 0;
    const why =
      worst && worst.transfer_fee === 0 && best.transfer_fee > 0
        ? `${worst.provider_name} charges no fee, but its exchange rate costs you more than ${best.provider_name}'s ${formatMoney(best.transfer_fee, source.currency)} fee.`
        : "That's after fees and the margin hidden in each exchange rate.";
    const payee = ob.payee.replace(" Treasury", "");
    emit({
      type: "text",
      text:
        `Your tuition of **${formatMoney(ob.amount, ob.currency)}** is due in **${ob.days_until} days**, and ${source.name} •••• ${source.account_last4} has enough to cover it. ` +
        `It meets all ${rules.rules.length} transfer rules on record for ${COUNTRY_NAMES[source.country]} → ${COUNTRY_NAMES[ob.destination_country]}.\n\n` +
        `**${cost.best_value_provider}** is your best route${extra > 0 ? `: about **${ob.currency} ${Math.round(extra).toLocaleString("en-GB")} more** reaches ${payee} than with ${worst.provider_name}` : ""}. ${why} ` +
        `You'd send about **${formatMoney(bestSend.send_amount, source.currency)}** for the full ${formatMoney(ob.amount, ob.currency)} to arrive.\n\n` +
        `Shall I prepare the payment? Nothing is sent until you approve it.`,
    });
    return emit({ type: "suggestions", items: [`Prepare the payment with ${cost.best_value_provider}`, "Why not Home Bank?"] });
  }

  emit({ type: "phase", phase: "Obtain approval" });
  const prep = await invokeTool(ctx, emit, "createTransferInstruction", { obligation_id: ob.id, provider_id: chosenId, source_account_id: source.id });
  if (!prep.ok) {
    emit({ type: "card", card: { kind: "blocked", title: "Transfer not prepared", reason: prep.error!.message, items: [] } });
    return emit({ type: "text", text: `I couldn't prepare the transfer: ${prep.error!.message}` });
  }
  const p = ok<{ send: string; recipient_gets: string; provider: string; expires_at: string }>(prep);
  const note = chosenId !== cost.best_value_provider_id ? ` You chose ${p.provider}; ${cost.best_value_provider} would deliver the same amount for less.` : "";
  emit({
    type: "text",
    text: `It's ready to review: **${p.send}** from ${source.name} •••• ${source.account_last4} via **${p.provider}**, so ${ob.payee.replace(" Treasury", "")} gets **${p.recipient_gets}**.${note}\n\nCheck the details and confirm when you're happy. The rate is held for 15 minutes.`,
  });
}

async function whyNotFlow(ctx: ActionContext, emit: Emit) {
  const profile = await ctx.repo.getProfile();
  const obligations = await ctx.repo.listObligations();
  const tuition = obligations.find((o) => o.kind === "tuition" && o.status !== "PAID");
  const req = tuition
    ? { source_currency: profile.home_currency, destination_currency: tuition.currency, destination_amount: tuition.amount }
    : { source_currency: profile.home_currency, destination_currency: profile.study_currency, source_amount: 1000 };
  const r = await invokeTool(ctx, emit, "calculateTransferCost", req);
  if (!r.ok) return emit({ type: "text", text: r.error!.message });
  const d = ok<{ explanation: string }>(r);
  emit({ type: "text", text: `CaiMao ranks routes by what the recipient receives, not by the advertised fee. A fee-free provider can still cost more when its cost sits inside the exchange rate.\n\n${d.explanation}` });
  emit({ type: "suggestions", items: ["Prepare the payment", "Check transfer rules"] });
}

async function compareFlow(ctx: ActionContext, emit: Emit, t: string) {
  const profileRes = await invokeTool(ctx, emit, "getUserProfile", {});
  const profile = ok<Profile>(profileRes);
  const parsed = parseAmount(t.replace(/\b(sgd|gbp|usd|cny|hkd|vnd)\b\s*(to|→|->)\s*\b(sgd|gbp|usd|cny|hkd|vnd)\b/i, ""));
  const obligations = await ctx.repo.listObligations();
  const tuition = obligations.find((o) => o.kind === "tuition" && o.status !== "PAID");
  const src = profile.home_currency;
  const dst = profile.study_currency;
  await invokeTool(ctx, emit, "getFXRate", { from: src, to: dst });
  const req =
    parsed && parsed.amount >= 10
      ? { source_currency: src, destination_currency: dst, source_amount: parsed.amount }
      : tuition
        ? { source_currency: src, destination_currency: dst, destination_amount: tuition.amount }
        : { source_currency: src, destination_currency: dst, source_amount: 1000 };
  await invokeTool(ctx, emit, "getRemittanceQuotes", req);
  const r = await invokeTool(ctx, emit, "calculateTransferCost", req);
  if (!r.ok) return emit({ type: "text", text: r.error!.message });
  const d = ok<{ compare_amount: number; best_value_provider: string; explanation: string }>(r);
  emit({
    type: "text",
    text: `Comparing ${src} → ${dst} at a common send amount of **${formatMoney(d.compare_amount, src)}**${"destination_amount" in req ? ` (about what your tuition needs)` : ""}. **${d.best_value_provider}** delivers the most.\n\n${d.explanation}`,
  });
  emit({ type: "suggestions", items: tuition ? ["Pay my tuition", "Why not Home Bank?"] : ["Check transfer rules"] });
}

async function sendMoneyFlow(ctx: ActionContext, emit: Emit, t: string) {
  const profile = await ctx.repo.getProfile();
  const parsed = parseAmount(t);
  const amount = parsed && parsed.amount >= 10 ? parsed.amount : 1000;
  const countries = parseCountries(t);
  const dest = countries.find((c) => c !== profile.home_country) ?? profile.study_country;
  const src = profile.home_currency;
  const dst = COUNTRY_CURRENCY[dest];
  await invokeTool(ctx, emit, "getTransferRules", { source_country: profile.home_country, destination_country: dest, transaction_type: "personal", amount, currency: src });
  const r = await invokeTool(ctx, emit, "calculateTransferCost", { source_currency: src, destination_currency: dst, source_amount: amount });
  if (!r.ok) return emit({ type: "text", text: r.error!.message });
  const d = ok<{ best_value_provider: string; explanation: string }>(r);
  emit({
    type: "text",
    text: `Sending **${formatMoney(amount, src)}** from ${COUNTRY_NAMES[profile.home_country]} to ${COUNTRY_NAMES[dest]}: **${d.best_value_provider}** delivers the most.\n\n${d.explanation}\n\nIn this prototype CaiMao executes payments only for obligations on file, such as tuition. Tell me a different amount to re-run the comparison.`,
  });
}

async function rulesFlow(ctx: ActionContext, emit: Emit, t: string) {
  const profile = await ctx.repo.getProfile();
  const countries = parseCountries(t);
  const source = countries[0] ?? profile.home_country;
  const dest = countries[1] ?? (countries[0] && countries[0] !== profile.study_country ? profile.study_country : profile.study_country);
  const r = await invokeTool(ctx, emit, "getTransferRules", { source_country: source, destination_country: dest === source ? profile.study_country : dest });
  const rules = ok<{ rule_name: string; official_source: string; last_verified: string }[]>(r) ?? [];
  emit({
    type: "text",
    text: rules.length
      ? `There are **${rules.length} rules** on record for ${COUNTRY_NAMES[source]} → ${COUNTRY_NAMES[dest === source ? profile.study_country : dest]}. Each shows its source and when it was last verified. These are **simulated demo rules**: check the official source before relying on them.`
      : `There are no rules on record for that corridor, so I can't say what applies. I won't guess; check with the official regulator.`,
  });
  emit({ type: "suggestions", items: ["Pay my tuition", "Check rules from China to the UK"] });
}
