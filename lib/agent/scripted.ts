import { randomUUID } from "node:crypto";
import type { Repository } from "../data/repository";
import type { ActionContext } from "../audit";
import { DomainError, pickSourceAccount } from "../finance";
import { formatMoney, formatRate } from "../fx/service";
import {
  COUNTRY_CURRENCY,
  SUPPORTED_COUNTRIES,
  type ComplianceResult,
  type CountryCode,
  type Currency,
  type Locale,
  type Obligation,
  type Profile,
  type SupportedCountry,
} from "../types";
import type { BudgetSummary } from "../budget/insights";
import type { StatementAnalysis } from "../statements/analyse";
import type { EligibilityResult } from "../banking/eligibility";
import type { RegulatoryResult } from "../regulatory/engine";
import { renderInsight } from "../statements/insight-text";
import { renderExplanation } from "../remittance/explain-i18n";
import type { ExplanationPart } from "../remittance/engine";
import { serverTranslator, type AnyT } from "../i18n/translator";
import { DATE_LOCALE, LOCALE_LABELS } from "../i18n/locale";
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

// ───────────────────────── Understanding the request ─────────────────────────

type Intent =
  | "language"
  | "pay_obligation"
  | "prepare_payment"
  | "fund_flow"
  | "setup"
  | "statement"
  | "compare_fx"
  | "send_money"
  | "check_rules"
  | "spending"
  | "credit"
  | "balances"
  | "why_not"
  | "help";

const COUNTRY_WORDS: [RegExp, CountryCode][] = [
  [/\b(china|chinese|prc|mainland)\b|中国|中國|中华|中国大陆/, "CN"],
  [/\b(vietnam|viet nam|vietnamese)\b|越南|ベトナム/, "VN"],
  [/\b(hong kong|hk)\b|香港/, "HK"],
  [/\b(japan|japanese)\b|日本/, "JP"],
  [/\b(united states|usa|u\.s\.|america|american|us)\b|美国|美國|アメリカ|米国/, "US"],
  [/\b(united kingdom|uk|u\.k\.|britain|british|england|gb)\b|英国|英國|イギリス|英國/, "GB"],
  [/\b(singapore|singaporean|sg)\b|新加坡|シンガポール/, "SG"],
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
  const m = text.match(/(usd|gbp|sgd|cny|rmb|hkd|vnd|jpy|£|\$|s\$|¥)?\s?([\d,]+(?:\.\d+)?)\s?(k|万)?\s?(usd|gbp|sgd|cny|rmb|hkd|vnd|jpy|元|円)?/i);
  if (!m || !m[2]) return null;
  let amount = Number(m[2].replace(/,/g, ""));
  if (!amount) return null;
  if (m[3] === "k" || m[3] === "K") amount *= 1000;
  if (m[3] === "万") amount *= 10000;
  const sym = (m[1] || m[4] || "").toLowerCase();
  const currency = (
    sym === "£" ? "GBP" : sym === "$" ? "USD" : sym === "s$" ? "SGD" : sym === "rmb" || sym === "元" ? "CNY" : sym === "円" ? "JPY" : sym === "¥" ? null : sym ? sym.toUpperCase() : null
  ) as Currency | null;
  return { amount, currency };
}

/** What the user has told us about themselves in this conversation (latest statement wins). */
export interface Facts {
  nationality?: CountryCode;
  destination?: CountryCode;
  source?: CountryCode;
  visa_type?: "student" | "none";
  residency_status?: "resident" | "non_resident";
  student?: boolean;
  age?: number;
}

const NATIONALITY: [RegExp, CountryCode][] = [
  [/\b(chinese)\b|中国(人|学生|籍|留学生)|中国人留学生/, "CN"],
  [/\b(singaporean)\b|新加坡(人|籍)|シンガポール人/, "SG"],
  [/\b(british)\b|英国(人|籍)|イギリス人/, "GB"],
  [/\b(american)\b|美国(人|籍)|アメリカ人/, "US"],
  [/\b(japanese)\b|日本(人|籍)/, "JP"],
  [/\b(vietnamese)\b|越南(人|籍)|ベトナム人/, "VN"],
  [/\bhong konger\b|香港(人|籍)/, "HK"],
];

export function extractFacts(userMessages: string[]): Facts {
  const f: Facts = {};
  for (const raw of userMessages) {
    const t = raw.toLowerCase();
    for (const [re, c] of NATIONALITY) if (re.test(t)) f.nationality = c;
    const dest = t.match(/(?:moving to|move to|studying in|study in|going to|relocating to|starting (?:uni|university|school) in|to)\s+([a-z .]+?)(?:[,.?!]|\s+(?:next|this|for|and|to|in)\b|$)/);
    if (dest) {
      const c = parseCountries(dest[1])[0];
      if (c) f.destination = c;
    }
    const cjkDest = raw.match(/(?:去|到|搬到|前往|赴)\s*([^\s，。？！,.]{2,6}?)(?:留学|读书|上学|学习|生活|了|，|。|$)|([^\s、。？！]{2,7}?)(?:に留学|へ留学|で留学|に引っ越)/);
    if (cjkDest) {
      const c = parseCountries(cjkDest[1] ?? cjkDest[2] ?? "")[0];
      if (c) f.destination = c;
    }
    const route = t.match(/from\s+([a-z .]+?)\s+to\s+([a-z .]+?)(?:[,.?!]|\s|$)/) ?? raw.match(/从\s*(\S{2,6}?)\s*(?:汇|转|寄|付|到|往)\S*?\s*(?:到|至|往)\s*(\S{2,6}?)(?:[，。？！]|$)|(\S{2,7}?)から\s*(\S{2,7}?)(?:へ|に)/);
    if (route) {
      const a = parseCountries(route[1] ?? route[3] ?? "")[0];
      const b = parseCountries(route[2] ?? route[4] ?? "")[0];
      if (a) f.source = a;
      if (b) f.destination = b;
    }
    if (/student (pass|visa|permit)|\bf-?1\b|\btier 4\b|study permit|学生签证|学生准证|留学签证|居留许可|留学ビザ|在留カード|student'?s pass/.test(t)) f.visa_type = "student";
    if (/(no|don'?t have|haven'?t got|without)( a)? (visa|pass)|还没有签证|ビザがまだ/.test(t)) f.visa_type = "none";
    if (/(i'?ve|i have|already|just) (arrived|moved)|i('m| am) (already )?(living|based) in|已经到了|已到达|已经在|住在|到着しました|住んでいます|もう.*にいます/.test(t)) f.residency_status = "resident";
    if (/(haven'?t|have not|not yet) (arrived|moved)|before i (move|arrive|go)|not there yet|还没到|还没去|出发前|まだ(着いて|行って)/.test(t)) f.residency_status = "non_resident";
    if (/\bstudent\b|学生|留学生/.test(t)) f.student = true;
    const age = t.match(/\b(\d{2})\s?(?:years? old|yo|岁|歳|才)|\bi'?m (\d{2})\b|我(\d{2})岁/);
    if (age) {
      const n = Number(age[1] ?? age[2] ?? age[3]);
      if (n >= 13 && n <= 99) f.age = n;
    }
  }
  return f;
}

function targetLanguage(t: string): Locale | null {
  if (/japanese|日本語|日语|日文/.test(t)) return "ja";
  if (/chinese|mandarin|中文|汉语|简体|中国語/.test(t)) return "zh-CN";
  if (/english|英文|英语|英語/.test(t)) return "en";
  return null;
}

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  const countries = parseCountries(t);
  if (/\b(switch|change|set)\b.*\b(language|english|chinese|japanese)\b|\b(reply|answer|respond|speak|talk)\b.*\b(in )?(english|chinese|japanese|mandarin)\b|用中文|说中文|中文回答|切换.*(中文|英文|日文|语言)|日本語で|日本語に|英語で|中国語で|言語を/.test(t) && targetLanguage(t))
    return "language";
  if (/\b(prepare|go ahead|proceed|set up the payment|yes,? (please|prepare|pay)|do it)\b|准备付款|准备支付|支払いを準備|進めて/.test(t) && !/\bwhy\b/.test(t)) return "prepare_payment";
  if (/\bwhy (not|didn't|isn't)\b|\bwhy .*(home bank|cheapest|zero fee|no fee)|为什么不|なぜ.*home bank/.test(t)) return "why_not";
  const corridor = countries.length >= 2 || /\bfrom\s+\w+\s+to\s+\w+/.test(t) || /从.+(到|至)|から.+(へ|に)/.test(t);
  const moneyWords = /\b(send|sending|transfer|remit|pay|paying|tuition|fees|money|rules?|limit|regulat|allowed|permitted|documents?)\b|汇款|转账|学费|规定|规则|送金|学費|ルール|規制/.test(t);
  if (corridor && moneyWords && !/\b(bank account|set ?up my financ)/.test(t)) return "fund_flow";
  if (/\b(pay|settle)\b.*\b(tuition|fees?|rent|invoice|card|bill)\b|\btuition\b|付学费|缴学费|学費を払/.test(t)) return "pay_obligation";
  if (/\b(rule|regulat|complian|allowed|limit|legal|permitted)/.test(t) || /规定|规则|ルール|規制/.test(t)) return "check_rules";
  if (/set ?up my financ|financial setup|\bmoving to\b|\bmove to\b|open (a |an )?(local )?(bank|account)|bank account|\bchecklist\b|开户|银行账户|开银行|口座|銀行|留学准备|お金の準備/.test(t)) return "setup";
  if (/\bstatement\b|spending analysis|analy[sz]e my spending|对账单|流水|账单分析|明細|明细/.test(t)) return "statement";
  if (/\b(send|remit|transfer)\b.*\b(overseas|abroad|money|home)\b|\bsend money\b|汇款|送金/.test(t)) return "send_money";
  if (/\b(compare|fx|exchange rate|rates?|quote|cheapest|transfer options|provider)\b|汇率|為替/.test(t)) return "compare_fx";
  if (/\b(spend|spending|budget|expense|saving|afford)|消费|预算|支出|予算/.test(t)) return "spending";
  if (/\bcredit\b|信用|クレジット/.test(t)) return "credit";
  if (/\b(balance|how much (money|cash)|accounts?|total cash)\b|余额|残高/.test(t)) return "balances";
  return "help";
}

// ───────────────────────── Planner ─────────────────────────

const ok = <T>(o: ToolCallOutcome) => o.result?.data as T;
const isSupported = (c: string | undefined): c is SupportedCountry => !!c && (SUPPORTED_COUNTRIES as readonly string[]).includes(c);

interface Ctx {
  ctx: ActionContext;
  emit: Emit;
  t: AnyT;
  tc: AnyT;
  locale: Locale;
}

/**
 * Deterministic planner. Runs the same tools as the LLM agent in a fixed, auditable order and
 * writes its narrative only from tool results, in the user's language. Used when no model key
 * is configured, and as a fallback when the model is unavailable.
 */
export async function runScripted(repo: Repository, messages: ChatMessage[], emit: Emit, correlationId: string) {
  const ctx: ActionContext = { repo, actor: "ai_agent", correlationId };
  const profile = await repo.getProfile();
  const locale = profile.language;
  const c: Ctx = { ctx, emit, t: serverTranslator(locale, "Agent"), tc: serverTranslator(locale, "Countries"), locale };
  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
  const last = userMessages[userMessages.length - 1] ?? "";
  const intent = detectIntent(last);
  const t = last.toLowerCase();
  const facts = extractFacts(userMessages);

  switch (intent) {
    case "language":
      return languageFlow(c, t);
    case "pay_obligation":
    case "prepare_payment":
      return payObligationFlow(c, t, intent === "prepare_payment");
    case "why_not":
      return whyNotFlow(c);
    case "fund_flow":
    case "check_rules":
      return fundFlow(c, t, facts, profile);
    case "setup":
      return setupFlow(c, facts, profile);
    case "statement":
      return statementFlow(c);
    case "compare_fx":
      return compareFlow(c, t);
    case "send_money":
      return sendMoneyFlow(c, t);
    case "spending": {
      const r = await invokeTool(ctx, emit, "getTransactions", {});
      if (!r.ok) return emit({ type: "text", text: r.error!.message });
      const s = ok<{ summary: BudgetSummary }>(r).summary;
      emit({
        type: "text",
        text:
          c.t(s.obligations_paid > 0 ? "spending.summaryWithObligations" : "spending.summary", {
            income: formatMoney(s.income, s.currency),
            expenses: formatMoney(s.expenses, s.currency),
            obligations: formatMoney(s.obligations_paid, s.currency),
            savings: formatMoney(s.savings, s.currency),
          }) + (locale === "en" && s.insights.length ? "\n\n" + s.insights.map((i) => `- ${i}`).join("\n") : ""),
      });
      return emit({ type: "suggestions", items: [c.t("suggest.analyseStatement"), c.t("suggest.payTuition")] });
    }
    case "credit": {
      const country = parseCountries(t).find(isSupported);
      if (country) return creditInfoFlow(c, country);
      const r = await invokeTool(ctx, emit, "getCreditSummary", {});
      const d = ok<{ utilisation: number; days_until_due: number; current_balance: number; credit_limit: number; currency: Currency; minimum_payment: number } | null>(r);
      if (!d) return emit({ type: "text", text: c.t("credit.noCard") });
      emit({
        type: "text",
        text: c.t("credit.summary", {
          balance: formatMoney(d.current_balance, d.currency),
          limit: formatMoney(d.credit_limit, d.currency),
          pct: (d.utilisation * 100).toFixed(1),
          days: d.days_until_due,
          minimum: formatMoney(d.minimum_payment, d.currency),
        }),
      });
      return emit({ type: "suggestions", items: [c.t("suggest.creditHere", { country: c.tc(profile.study_country) }), c.t("suggest.setup")] });
    }
    case "balances": {
      const r = await invokeTool(ctx, emit, "getAccounts", {});
      const d = ok<{ total_in_base: number; base_currency: Currency }>(r);
      emit({ type: "text", text: c.t("balances", { total: formatMoney(d.total_in_base, d.base_currency) }) });
      return emit({ type: "suggestions", items: [c.t("suggest.payTuition"), c.t("suggest.reviewSpending")] });
    }
    default:
      emit({ type: "text", text: c.t("help") });
      return emit({ type: "suggestions", items: [c.t("suggest.payTuition"), c.t("suggest.setupExample"), c.t("suggest.analyseStatement"), c.t("suggest.rulesExample")] });
  }
}

// ───────────────────────── Language ─────────────────────────

async function languageFlow(c: Ctx, t: string) {
  const target = targetLanguage(t);
  if (!target) return c.emit({ type: "text", text: c.t("language.which") });
  const r = await invokeTool(c.ctx, c.emit, "updateLanguagePreference", { language: target });
  if (!r.ok) return c.emit({ type: "text", text: r.error!.message });
  // Confirm in the new language.
  c.emit({ type: "text", text: serverTranslator(target, "Agent")("language.switched", { language: LOCALE_LABELS[target].native }) });
}

// ───────────────────────── Financial setup / banking abroad ─────────────────────────

async function setupFlow(c: Ctx, facts: Facts, profile: Profile) {
  const destination = (isSupported(facts.destination) ? facts.destination : isSupported(profile.study_country) ? profile.study_country : null) as SupportedCountry | null;
  if (!destination) return c.emit({ type: "text", text: c.t("setup.whichCountry") });
  // A described situation (planned move, different nationality) replaces the saved profile for this answer.
  const describedPersona = (!!facts.nationality && facts.nationality !== profile.nationality) || (!!facts.destination && facts.destination !== profile.study_country);
  const persona = {
    use_profile: !describedPersona,
    ...(facts.nationality ? { nationality: facts.nationality } : {}),
    ...(facts.visa_type ? { visa_type: facts.visa_type } : {}),
    ...(facts.residency_status ? { residency_status: facts.residency_status } : {}),
    ...(facts.age ? { age: facts.age } : {}),
    ...(facts.student ? { student_status: "full_time" } : {}),
  };
  const country = c.tc(destination);

  c.emit({ type: "phase", phase: "Understand" });
  const req = await invokeTool(c.ctx, c.emit, "getCountryBankingRequirements", { country: destination });
  const requirements = ok<{ typical_documents?: string[]; sources?: string[]; last_verified?: string; found?: boolean }>(req);
  c.emit({ type: "phase", phase: "Analyse" });
  await invokeTool(c.ctx, c.emit, "getAvailableBanks", { country: destination });
  c.emit({ type: "phase", phase: "Check compliance" });
  const el = await invokeTool(c.ctx, c.emit, "getBankEligibility", { country: destination, ...persona });
  if (!el.ok) return c.emit({ type: "text", text: el.error!.message });
  const card = el.result!.cards?.[0] as Extract<AgentCard, { kind: "banks" }> | undefined;
  const eligibility = card?.eligibility as EligibilityResult;
  await invokeTool(c.ctx, c.emit, "getCreditSystemInfo", { country: destination });
  c.emit({ type: "phase", phase: "Recommend" });

  const tf = serverTranslator(c.locale, "ProfileFields");
  const docs = (requirements?.typical_documents ?? []).slice(0, 6);
  const parts: string[] = [];
  const who = facts.nationality ? c.t("setup.whoNational", { nationality: c.tc(facts.nationality), country }) : c.t("setup.who", { country });
  parts.push(who);
  if (docs.length) parts.push(c.t("setup.documents", { docs: docs.map((d) => `- ${d}`).join("\n") }));
  if (eligibility.missing.length) {
    parts.push(c.t("setup.askDetails", { fields: eligibility.missing.map((m) => tf(m)).join(", ") }));
  } else {
    const likely = eligibility.banks.filter((b) => b.verdict === "likely_eligible").map((b) => b.bank.bank_name);
    const check = eligibility.banks.filter((b) => b.verdict === "check_with_bank").map((b) => b.bank.bank_name);
    if (likely.length) parts.push(c.t("setup.likely", { banks: likely.join(", ") }));
    if (check.length) parts.push(c.t("setup.check", { banks: check.join(", ") }));
    parts.push(c.t("setup.bankDecides"));
  }
  if (requirements?.last_verified) parts.push(c.t("setup.sources", { count: requirements.sources?.length ?? 0, date: fmtDate(requirements.last_verified, c.locale) }));
  c.emit({ type: "text", text: parts.join("\n\n") });

  const home = facts.source ?? facts.nationality ?? profile.home_country;
  const items: string[] = [];
  if (eligibility.missing.includes("visa_type") || eligibility.missing.includes("residency_status")) items.push(c.t("suggest.haveStudentPass"));
  if (home !== destination) items.push(c.t("suggest.tuitionRules", { from: c.tc(home), to: country }));
  if (!describedPersona) items.push(c.t("suggest.createPlan"));
  c.emit({ type: "suggestions", items });
}

async function creditInfoFlow(c: Ctx, country: SupportedCountry) {
  const r = await invokeTool(c.ctx, c.emit, "getCreditSystemInfo", { country });
  const info = ok<{ found?: boolean; bureaus?: string[]; has_formal_bureau?: boolean | null; last_verified?: string }>(r);
  if (!info || info.found === false) return c.emit({ type: "text", text: c.t("credit.none", { country: c.tc(country) }) });
  c.emit({
    type: "text",
    text: c.t(info.has_formal_bureau ? "credit.country" : "credit.countryNoBureau", { country: c.tc(country), bureaus: (info.bureaus ?? []).join(", "), date: fmtDate(info.last_verified!, c.locale) }),
  });
}

// ───────────────────────── Cross-border rules ─────────────────────────

async function fundFlow(c: Ctx, t: string, facts: Facts, profile: Profile) {
  const countries = parseCountries(t);
  let source = facts.source ?? countries[0] ?? profile.home_country;
  let destination = facts.destination ?? countries[1] ?? (countries[0] && countries[0] !== source ? countries[0] : profile.study_country);
  if (source === destination) destination = source === profile.study_country ? profile.home_country : profile.study_country;
  if (countries.length === 1 && !facts.source) {
    // "Rules for sending tuition to Singapore": money leaves the user's (stated) home.
    source = facts.nationality ?? profile.home_country;
    destination = countries[0];
  }
  const parsed = parseAmount(t);
  const amount = parsed && parsed.amount >= 10 ? parsed : null;
  const purpose = /\b(tuition|fees?|school|university|study|education)\b|学费|学費|授業料|留学/.test(t) || !/\bpersonal|living\b/.test(t) ? "education" : "personal";
  const describedPersona = !!facts.nationality && facts.nationality !== profile.nationality;

  c.emit({ type: "phase", phase: "Check compliance" });
  const r = await invokeTool(c.ctx, c.emit, "getFundFlowRules", {
    source_country: source,
    destination_country: destination,
    purpose,
    ...(amount ? { amount: amount.amount, currency: amount.currency ?? COUNTRY_CURRENCY[destination] } : {}),
    ...(facts.nationality ? { nationality: facts.nationality } : {}),
    ...(facts.visa_type ? { visa_type: facts.visa_type } : {}),
    ...(facts.residency_status ? { residency_status: facts.residency_status } : {}),
    use_profile: !describedPersona,
  });
  if (!r.ok) return c.emit({ type: "text", text: r.error!.message });
  const result = (r.result!.cards?.[0] as Extract<AgentCard, { kind: "regulatory" }>).result as RegulatoryResult;
  const from = c.tc(source);
  const to = c.tc(destination);
  const parts: string[] = [];
  if (result.unverified_message) {
    parts.push(c.t("rules.unverified"));
  } else {
    parts.push(c.t(`rules.status.${result.status}`, { from, to }));
    const needed = result.documents.filter((d) => !d.on_file).map((d) => d.name);
    if (needed.length) parts.push(c.t("rules.documents", { docs: needed.map((d) => `- ${d}`).join("\n") }));
    const reports = result.findings.filter((f) => f.outcome === "REPORT").length;
    if (reports) parts.push(c.t("rules.reports", { count: reports }));
    if (result.missing_info.length) {
      const tf = serverTranslator(c.locale, "ProfileFields");
      parts.push(c.t("rules.askDetails", { fields: result.missing_info.map((m) => tf(m)).join(", ") }));
    }
    const dates = result.sources.map((s) => s.last_verified).sort();
    parts.push(c.t("rules.sources", { count: result.sources.length, date: dates.length ? fmtDate(dates[0], c.locale) : "—" }));
  }
  parts.push(c.t("rules.disclaimer"));
  c.emit({ type: "text", text: parts.join("\n\n") });
  const items = [] as string[];
  if (!amount) items.push(c.t("suggest.withAmount", { from, to, currency: COUNTRY_CURRENCY[destination] }));
  if (destination === profile.study_country) items.push(c.t("suggest.payTuition"));
  c.emit({ type: "suggestions", items });
}

// ───────────────────────── Statement analysis ─────────────────────────

async function statementFlow(c: Ctx) {
  const r = await invokeTool(c.ctx, c.emit, "analyseSpending", {});
  const d = ok<{ found: boolean }>(r);
  if (!d?.found) {
    c.emit({ type: "text", text: c.t("statement.none") });
    return c.emit({ type: "suggestions", items: [c.t("suggest.reviewSpending")] });
  }
  await invokeTool(c.ctx, c.emit, "generateSavingsInsights", {});
  const analysis = (r.result!.cards?.[0] as Extract<AgentCard, { kind: "statement" }>).analysis as StatementAnalysis;
  const tr = {
    insights: serverTranslator(c.locale, "StatementInsights"),
    groups: serverTranslator(c.locale, "StatementPage.groups"),
    categories: serverTranslator(c.locale, "Categories"),
  };
  const lines = analysis.insights.slice(0, 5).map((i) => `- ${renderInsight(i, tr, DATE_LOCALE[c.locale])}`);
  c.emit({
    type: "text",
    text:
      c.t("statement.summary", {
        income: formatMoney(analysis.totals.income, analysis.currency),
        expenses: formatMoney(analysis.totals.expenses, analysis.currency),
        net: formatMoney(analysis.totals.net, analysis.currency, { sign: true }),
      }) +
      "\n\n" +
      lines.join("\n") +
      "\n\n" +
      c.t("statement.disclaimer"),
  });
}

// ───────────────────────── Payments (unchanged logic, localized text) ─────────────────────────

function providerFromText(t: string): string | null {
  if (/home bank/.test(t)) return "prov-home-bank";
  if (/panda/.test(t)) return "prov-panda-remit-demo";
  if (/wallet/.test(t)) return "prov-mc-wallet-demo";
  return null;
}

function kindFromText(t: string): Obligation["kind"] {
  if (/\brent\b|房租|家賃/.test(t)) return "rent";
  if (/\bcard\b|信用卡|カード/.test(t)) return "card";
  return "tuition";
}

const explainT = (c: Ctx) => serverTranslator(c.locale, "Explain") as unknown as (k: string, v?: Record<string, string | number>) => string;

async function payObligationFlow(c: Ctx, t: string, prepare: boolean) {
  const { ctx, emit } = c;
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
    return emit({ type: "text", text: paid ? c.t("pay.alreadyPaid", { title: paid.title, ref: paid.invoice_ref }) : c.t("pay.noneUnpaid") });
  }
  if (ob.currency === profile.home_currency || ob.destination_country === profile.home_country) {
    return emit({ type: "text", text: c.t("pay.domestic", { title: ob.title, currency: ob.currency }) });
  }
  if (ob.kind !== "tuition") {
    return emit({ type: "text", text: c.t("pay.notTuition", { title: ob.title, amount: formatMoney(ob.amount, ob.currency), days: ob.days_until, currency: ob.currency }) });
  }

  emit({ type: "phase", phase: "Analyse" });
  const accRes = await invokeTool(ctx, emit, "getAccounts", {}, show);
  const accounts = ok<{ accounts: { id: string; name: string; masked: string; country: CountryCode; currency: Currency; balance: number }[] }>(accRes).accounts;
  const source = pickSourceAccount(
    accounts.map((a) => ({ ...a, user_id: "", institution: "", account_last4: a.masked.slice(-4), kind: "bank" as const })),
    profile as Profile,
  );
  if (!source) return emit({ type: "text", text: c.t("pay.noAccount", { currency: profile.home_currency }) });

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
    note: c.t("pay.fundsNote", { rate: formatRate(mid) }),
  };
  if (!prepare || !sufficient) emit({ type: "card", card: fundsCard });
  if (!sufficient) {
    emit({
      type: "card",
      card: {
        kind: "blocked",
        title: c.t("pay.insufficientTitle"),
        reason: c.t("pay.insufficientReason", { account: `${source.name} ****${source.account_last4}`, balance: formatMoney(source.balance, source.currency), amount: formatMoney(ob.amount, ob.currency), estimate: formatMoney(estimate, source.currency) }),
        items: [c.t("pay.insufficientTopUp"), c.t("pay.insufficientInstalment")],
      },
    });
    return emit({
      type: "text",
      text: c.t("pay.insufficientText", { title: ob.title, amount: formatMoney(ob.amount, ob.currency), days: ob.days_until, account: source.name, balance: formatMoney(source.balance, source.currency), estimate: formatMoney(estimate, source.currency) }),
    });
  }

  emit({ type: "phase", phase: "Check compliance" });
  const ruleRes = await invokeTool(ctx, emit, "getTransferRules", { source_country: source.country, destination_country: ob.destination_country, transaction_type: "education", amount: estimate, currency: source.currency }, show);
  if (!ruleRes.ok) return emit({ type: "text", text: ruleRes.error!.message });
  const rules = ok<{ status: ComplianceResult["status"]; rules: { rule_name: string; outcome: string; message: string }[]; required_documents: { name: string; on_file: boolean }[] }>(ruleRes);
  const from = c.tc(source.country);
  const to = c.tc(ob.destination_country);
  if (rules.status === "BLOCKED") {
    const blocking = rules.rules.filter((r) => r.outcome === "BLOCK");
    emit({ type: "card", card: { kind: "blocked", title: c.t("pay.blockedTitle"), reason: c.t("pay.blockedReason"), items: blocking.map((b) => `${b.rule_name}: ${b.message}`) } });
    return emit({ type: "text", text: c.t("pay.blockedText", { from, to, reasons: blocking.map((b) => b.message).join(" ") }) });
  }
  if (rules.status === "ACTION_REQUIRED") {
    const missing = rules.required_documents.filter((d) => !d.on_file).map((d) => d.name);
    emit({ type: "card", card: { kind: "blocked", title: c.t("pay.actionTitle"), reason: c.t("pay.actionReason"), items: missing.length ? missing : [c.t("pay.noRulesCorridor")] } });
    return emit({ type: "text", text: c.t("pay.actionText", { docs: missing.join(", ") }) });
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
  if (!cost.best_value_provider_id) return emit({ type: "text", text: c.t("pay.noProvider") });

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
        ? c.t("pay.whyZeroFee", { worst: worst.provider_name, best: best.provider_name, fee: formatMoney(best.transfer_fee, source.currency) })
        : c.t("pay.whyGeneric");
    const payee = ob.payee.replace(" Treasury", "");
    emit({
      type: "text",
      text: [
        c.t("pay.recommendIntro", { amount: formatMoney(ob.amount, ob.currency), days: ob.days_until, account: `${source.name} •••• ${source.account_last4}`, count: rules.rules.length, from, to }),
        (extra > 0
          ? c.t("pay.recommendBestExtra", { provider: cost.best_value_provider!, extra: `${ob.currency} ${Math.round(extra).toLocaleString("en-GB")}`, payee, worst: worst.provider_name })
          : c.t("pay.recommendBest", { provider: cost.best_value_provider! })) +
          ` ${why} ` +
          c.t("pay.recommendSend", { send: formatMoney(bestSend.send_amount, source.currency), amount: formatMoney(ob.amount, ob.currency) }),
        c.t("pay.recommendAsk"),
      ].join("\n\n"),
    });
    const prepareText = c.t("suggest.prepareWith", { provider: cost.best_value_provider! });
    return emit({ type: "suggestions", items: [prepareText, c.t("suggest.whyNotHomeBank")], prepare: prepareText });
  }

  emit({ type: "phase", phase: "Obtain approval" });
  const prep = await invokeTool(ctx, emit, "createTransferInstruction", { obligation_id: ob.id, provider_id: chosenId, source_account_id: source.id });
  if (!prep.ok) {
    emit({ type: "card", card: { kind: "blocked", title: c.t("pay.notPreparedTitle"), reason: prep.error!.message, items: [] } });
    return emit({ type: "text", text: c.t("pay.notPreparedText", { reason: prep.error!.message }) });
  }
  const p = ok<{ send: string; recipient_gets: string; provider: string; expires_at: string }>(prep);
  const note = chosenId !== cost.best_value_provider_id ? " " + c.t("pay.chosenOther", { chosen: p.provider, best: cost.best_value_provider! }) : "";
  emit({
    type: "text",
    text: c.t("pay.ready", { send: p.send, account: `${source.name} •••• ${source.account_last4}`, provider: p.provider, payee: ob.payee.replace(" Treasury", ""), gets: p.recipient_gets }) + note + "\n\n" + c.t("pay.readyCheck"),
  });
}

async function whyNotFlow(c: Ctx) {
  const profile = await c.ctx.repo.getProfile();
  const obligations = await c.ctx.repo.listObligations();
  const tuition = obligations.find((o) => o.kind === "tuition" && o.status !== "PAID");
  const req = tuition
    ? { source_currency: profile.home_currency, destination_currency: tuition.currency, destination_amount: tuition.amount }
    : { source_currency: profile.home_currency, destination_currency: profile.study_currency, source_amount: 1000 };
  const r = await invokeTool(c.ctx, c.emit, "calculateTransferCost", req);
  if (!r.ok) return c.emit({ type: "text", text: r.error!.message });
  const parts = (r.result!.cards?.[0] as Extract<AgentCard, { kind: "quotes" }> | undefined)?.explanation_parts;
  const d = ok<{ explanation: string }>(r);
  c.emit({ type: "text", text: `${c.t("whyNot")}\n\n${renderExplanation(parts as ExplanationPart[] | undefined, explainT(c), d.explanation)}` });
  c.emit({ type: "suggestions", items: [c.t("suggest.prepare"), c.t("suggest.checkRules")] });
}

async function compareFlow(c: Ctx, t: string) {
  const profileRes = await invokeTool(c.ctx, c.emit, "getUserProfile", {});
  const profile = ok<Profile>(profileRes);
  const parsed = parseAmount(t.replace(/\b(sgd|gbp|usd|cny|hkd|vnd|jpy)\b\s*(to|→|->)\s*\b(sgd|gbp|usd|cny|hkd|vnd|jpy)\b/i, ""));
  const obligations = await c.ctx.repo.listObligations();
  const tuition = obligations.find((o) => o.kind === "tuition" && o.status !== "PAID");
  const src = profile.home_currency;
  const dst = profile.study_currency;
  await invokeTool(c.ctx, c.emit, "getFXRate", { from: src, to: dst });
  const req =
    parsed && parsed.amount >= 10
      ? { source_currency: src, destination_currency: dst, source_amount: parsed.amount }
      : tuition
        ? { source_currency: src, destination_currency: dst, destination_amount: tuition.amount }
        : { source_currency: src, destination_currency: dst, source_amount: 1000 };
  await invokeTool(c.ctx, c.emit, "getRemittanceQuotes", req);
  const r = await invokeTool(c.ctx, c.emit, "calculateTransferCost", req);
  if (!r.ok) return c.emit({ type: "text", text: r.error!.message });
  const d = ok<{ compare_amount: number; best_value_provider: string; explanation: string }>(r);
  const parts = (r.result!.cards?.[0] as Extract<AgentCard, { kind: "quotes" }> | undefined)?.explanation_parts;
  c.emit({
    type: "text",
    text: `${c.t("destination_amount" in req ? "compare.introTuition" : "compare.intro", { src, dst, amount: formatMoney(d.compare_amount, src), provider: d.best_value_provider })}\n\n${renderExplanation(parts as ExplanationPart[] | undefined, explainT(c), d.explanation)}`,
  });
  c.emit({ type: "suggestions", items: tuition ? [c.t("suggest.payTuition"), c.t("suggest.whyNotHomeBank")] : [c.t("suggest.checkRules")] });
}

async function sendMoneyFlow(c: Ctx, t: string) {
  const profile = await c.ctx.repo.getProfile();
  const parsed = parseAmount(t);
  const amount = parsed && parsed.amount >= 10 ? parsed.amount : 1000;
  const countries = parseCountries(t);
  const dest = countries.find((x) => x !== profile.home_country) ?? profile.study_country;
  const src = profile.home_currency;
  const dst = COUNTRY_CURRENCY[dest];
  await invokeTool(c.ctx, c.emit, "getTransferRules", { source_country: profile.home_country, destination_country: dest, transaction_type: "personal", amount, currency: src });
  const r = await invokeTool(c.ctx, c.emit, "calculateTransferCost", { source_currency: src, destination_currency: dst, source_amount: amount });
  if (!r.ok) return c.emit({ type: "text", text: r.error!.message });
  const d = ok<{ best_value_provider: string; explanation: string }>(r);
  const parts = (r.result!.cards?.[0] as Extract<AgentCard, { kind: "quotes" }> | undefined)?.explanation_parts;
  c.emit({
    type: "text",
    text: `${c.t("send.intro", { amount: formatMoney(amount, src), from: c.tc(profile.home_country), to: c.tc(dest), provider: d.best_value_provider })}\n\n${renderExplanation(parts as ExplanationPart[] | undefined, explainT(c), d.explanation)}\n\n${c.t("send.note")}`,
  });
}

function fmtDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
}
