import type { Currency, Obligation, StatementTransaction, TransactionCategory } from "../types";
import { isEssential } from "../budget/classifier";
import { roundMoney, type FxService } from "../fx/service";

/**
 * Deterministic spending analysis over confirmed statement rows. Every number on the
 * analysis screen comes from here; the model only ever receives this structured result.
 * Insights are returned as message codes + parameters so they can be shown in any language.
 */

export type InsightCode =
  | "net_negative"
  | "net_positive"
  | "category_above_average"
  | "subscriptions"
  | "essentials_share"
  | "unusual_payment"
  | "regular_income"
  | "projection_covered"
  | "projection_short"
  | "opportunity";

export interface Insight {
  code: InsightCode;
  params: Record<string, string | number>;
  /** Which part of the analysis the insight came from, for the evidence log. */
  basis: string;
}

export interface RecurringPayment {
  merchant: string;
  category: TransactionCategory;
  subcategory: string | null;
  cadence: "monthly" | "weekly";
  occurrences: number;
  average_amount: number;
  monthly_cost: number;
  last_date: string;
  is_subscription: boolean;
}

export interface StatementAnalysis {
  currency: Currency;
  period: { start: string; end: string; days: number; months: number };
  totals: { income: number; expenses: number; net: number; essential: number; discretionary: number; transfers_out: number };
  monthly: { month: string; income: number; expenses: number }[];
  categories: { category: TransactionCategory; amount: number; share: number; count: number; essential: boolean }[];
  top_merchants: { merchant: string; amount: number; count: number; category: TransactionCategory }[];
  recurring: RecurringPayment[];
  subscriptions: { count: number; monthly_cost: number };
  /** scope "category": compared with that category's median; "all": a one-off in a thin category, compared with the median payment overall. */
  unusual: { id: string; date: string; merchant: string; amount: number; category: TransactionCategory; typical: number; scope?: "category" | "all" }[];
  income_sources: { source: string; total: number; occurrences: number; regular: boolean }[];
  opportunity: { monthly: number; months: number; total: number; method: "above_average" | "illustrative_10pct"; categories: TransactionCategory[] };
  pressure: {
    obligation: { title: string; amount: number; currency: Currency; amount_converted: number; due_date: string; days: number } | null;
    cash_now: number;
    monthly_net: number;
    projected_available: number | null;
    covered: boolean | null;
  };
  insights: Insight[];
  rows_analysed: number;
  rows_excluded: number;
  low_confidence: number;
  is_estimate: true;
}

export interface AnalysisContext {
  currency: Currency;
  fx: FxService;
  /** Cash across the user's accounts, in any currency (converted here). */
  balances: { amount: number; currency: Currency }[];
  obligations: Obligation[];
  now?: Date;
}

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (d: string) => d.slice(0, 7);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};

export function analyseStatement(rows: StatementTransaction[], ctx: AnalysisContext): StatementAnalysis {
  const ccy = ctx.currency;
  const now = ctx.now ?? new Date();
  const conv = (amount: number, from: Currency) => (from === ccy ? amount : ctx.fx.convert(amount, from, ccy));
  const included = rows.filter((r) => r.included).map((r) => ({ ...r, value: conv(r.amount, r.currency) }));
  const dates = included.map((r) => r.date).sort();
  const start = dates[0] ?? now.toISOString().slice(0, 10);
  const end = dates[dates.length - 1] ?? start;
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1);
  const months = Math.max(1, Math.round((days / 30.4) * 10) / 10);

  // Transfers between own accounts are neither income nor spending.
  const spend = included.filter((r) => r.value < 0 && r.category !== "Transfers" && r.category !== "Income");
  const incomeRows = included.filter((r) => r.value > 0 && r.category !== "Transfers");
  const transfersOut = included.filter((r) => r.value < 0 && r.category === "Transfers");

  const income = r2(incomeRows.reduce((s, r) => s + r.value, 0));
  const expenses = r2(spend.reduce((s, r) => s - r.value, 0));
  const essential = r2(spend.filter((r) => isEssential(r.category, r.subcategory)).reduce((s, r) => s - r.value, 0));
  const discretionary = r2(expenses - essential);

  // Months, categories, merchants
  const monthMap = new Map<string, { income: number; expenses: number }>();
  for (const r of [...spend, ...incomeRows]) {
    const m = monthMap.get(monthOf(r.date)) ?? { income: 0, expenses: 0 };
    if (r.value > 0) m.income += r.value;
    else m.expenses -= r.value;
    monthMap.set(monthOf(r.date), m);
  }
  const monthly = [...monthMap.entries()].sort().map(([month, v]) => ({ month, income: r2(v.income), expenses: r2(v.expenses) }));

  const catMap = new Map<TransactionCategory, { amount: number; count: number; essential: number }>();
  for (const r of spend) {
    const c = catMap.get(r.category) ?? { amount: 0, count: 0, essential: 0 };
    c.amount -= r.value;
    c.count++;
    if (isEssential(r.category, r.subcategory)) c.essential -= r.value;
    catMap.set(r.category, c);
  }
  const categories = [...catMap.entries()]
    .map(([category, v]) => ({ category, amount: r2(v.amount), share: expenses ? v.amount / expenses : 0, count: v.count, essential: v.essential >= v.amount / 2 }))
    .sort((a, b) => b.amount - a.amount);

  const merchMap = new Map<string, { amount: number; count: number; category: TransactionCategory }>();
  for (const r of spend) {
    const m = merchMap.get(r.merchant) ?? { amount: 0, count: 0, category: r.category };
    m.amount -= r.value;
    m.count++;
    merchMap.set(r.merchant, m);
  }
  const top_merchants = [...merchMap.entries()]
    .map(([merchant, v]) => ({ merchant, amount: r2(v.amount), count: v.count, category: v.category }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // Recurring payments: same merchant, similar amount (±20%), regular spacing.
  const recurring: RecurringPayment[] = [];
  const byMerchant = new Map<string, typeof spend>();
  for (const r of spend) byMerchant.set(r.merchant, [...(byMerchant.get(r.merchant) ?? []), r]);
  for (const [merchant, list] of byMerchant) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((r) => -r.value);
    const med = median(amounts);
    if (!amounts.every((a) => Math.abs(a - med) <= Math.max(0.2 * med, 1))) continue;
    const gaps = sorted.slice(1).map((r, i) => (Date.parse(r.date) - Date.parse(sorted[i].date)) / DAY);
    const g = median(gaps);
    const cadence = g >= 25 && g <= 35 ? "monthly" : g >= 6 && g <= 8 ? "weekly" : null;
    const distinctMonths = new Set(sorted.map((r) => monthOf(r.date))).size;
    if (!cadence || (cadence === "monthly" && distinctMonths < 2)) continue;
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const first = sorted[0];
    recurring.push({
      merchant,
      category: first.category,
      subcategory: first.subcategory,
      cadence,
      occurrences: sorted.length,
      average_amount: r2(avg),
      monthly_cost: r2(cadence === "weekly" ? (avg * 52) / 12 : avg),
      last_date: sorted[sorted.length - 1].date,
      is_subscription: first.category === "Subscriptions",
    });
  }
  recurring.sort((a, b) => b.monthly_cost - a.monthly_cost);
  const subs = recurring.filter((r) => r.is_subscription);
  const subscriptions = { count: subs.length, monthly_cost: r2(subs.reduce((s, r) => s + r.monthly_cost, 0)) };

  // Unusual: a payment more than 3× the typical payment in its category (and at least 5% of spending).
  const unusual: StatementAnalysis["unusual"] = [];
  for (const [category] of catMap) {
    const list = spend.filter((r) => r.category === category);
    if (list.length < 3) continue;
    const typical = median(list.map((r) => -r.value));
    for (const r of list) {
      if (-r.value > typical * 3 && -r.value >= expenses * 0.05) {
        unusual.push({ id: r.id, date: r.date, merchant: r.merchant, amount: r2(-r.value), category, typical: r2(typical), scope: "category" });
      }
    }
  }
  // Categories with too little history: flag a single large one-off against the typical payment overall.
  const FIXED: TransactionCategory[] = ["Accommodation", "Education", "Transfers", "Fees"];
  const overallTypical = median(spend.filter((r) => !FIXED.includes(r.category)).map((r) => -r.value));
  for (const [category] of catMap) {
    if (FIXED.includes(category)) continue;
    const list = spend.filter((r) => r.category === category);
    if (list.length >= 3) continue;
    for (const r of list) {
      if (overallTypical > 0 && -r.value > overallTypical * 5 && -r.value >= expenses * 0.1) {
        unusual.push({ id: r.id, date: r.date, merchant: r.merchant, amount: r2(-r.value), category, typical: r2(overallTypical), scope: "all" });
      }
    }
  }
  unusual.sort((a, b) => b.amount - a.amount);

  // Income sources
  const incMap = new Map<string, { total: number; dates: string[] }>();
  for (const r of incomeRows) {
    const m = incMap.get(r.merchant) ?? { total: 0, dates: [] };
    m.total += r.value;
    m.dates.push(r.date);
    incMap.set(r.merchant, m);
  }
  const income_sources = [...incMap.entries()]
    .map(([source, v]) => ({ source, total: r2(v.total), occurrences: v.dates.length, regular: new Set(v.dates.map(monthOf)).size >= 2 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Estimated opportunity (never a guarantee).
  const discretionaryCats: TransactionCategory[] = [];
  let opportunityMonthly = 0;
  let method: StatementAnalysis["opportunity"]["method"] = "illustrative_10pct";
  const latestMonth = monthly[monthly.length - 1]?.month;
  const categoryAboveAverage: Insight[] = [];
  if (monthly.length >= 2 && latestMonth) {
    method = "above_average";
    const prior = monthly.slice(0, -1).map((m) => m.month);
    // One-off outliers (shown under "Unusual expenses") are excluded: a single big purchase
    // isn't a monthly habit, so it shouldn't inflate the estimated opportunity.
    const oneOffs = new Set(unusual.map((u) => u.id));
    const byCatMonth = (cat: TransactionCategory, sub: string | null | undefined, m: string) =>
      spend.filter((r) => !oneOffs.has(r.id) && r.category === cat && (sub === undefined || r.subcategory === sub) && monthOf(r.date) === m).reduce((s, r) => s - r.value, 0);
    // `label` is a message key (StatementPage.groups.*), so insights can be shown in any language.
    const groups: { cat: TransactionCategory; sub?: string | null; label: string }[] = [
      { cat: "Food", sub: "Eating out", label: "eating_out" },
      { cat: "Entertainment", label: "entertainment" },
      { cat: "Shopping", label: "shopping" },
      { cat: "Travel", label: "travel" },
      { cat: "Subscriptions", sub: "Digital services", label: "subscriptions" },
    ];
    for (const g of groups) {
      const latest = byCatMonth(g.cat, g.sub, latestMonth);
      const avg = prior.reduce((s, m) => s + byCatMonth(g.cat, g.sub, m), 0) / prior.length;
      const diff = latest - avg;
      if (diff > Math.max(10, avg * 0.15)) {
        opportunityMonthly += diff;
        discretionaryCats.push(g.cat);
        categoryAboveAverage.push({
          code: "category_above_average",
          params: { category: g.label, month: latestMonth, amount: r2(latest), diff: r2(diff), months: prior.length, currency: ccy },
          basis: "monthly category comparison",
        });
      }
    }
  } else {
    opportunityMonthly = (discretionary / months) * 0.1;
    discretionaryCats.push(...categories.filter((c) => !c.essential).map((c) => c.category));
  }

  // Financial pressure: next unpaid obligation vs cash now plus the monthly net flow.
  const cashNow = r2(ctx.balances.reduce((s, b) => s + conv(b.amount, b.currency), 0));
  const monthlyNet = r2((income - expenses) / months);
  const next = ctx.obligations
    .filter((o) => o.status !== "PAID")
    .map((o) => ({ ...o, days: Math.round((Date.parse(o.due_date) - now.getTime()) / DAY) }))
    .filter((o) => o.days >= 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const target = next.find((o) => o.kind === "tuition") ?? next[0] ?? null;
  let projected: number | null = null;
  let covered: boolean | null = null;
  let obligation: StatementAnalysis["pressure"]["obligation"] = null;
  if (target) {
    const before = next.filter((o) => o.due_date <= target.due_date);
    const due = before.reduce((s, o) => s + conv(o.amount, o.currency), 0);
    projected = r2(cashNow + monthlyNet * (target.days / 30.4) - due);
    covered = projected >= 0;
    obligation = { title: target.title, amount: target.amount, currency: target.currency, amount_converted: r2(conv(target.amount, target.currency)), due_date: target.due_date, days: target.days };
  }
  const horizon = obligation ? Math.max(1, Math.round(obligation.days / 30.4)) : 6;
  const opportunity = {
    monthly: roundMoney(opportunityMonthly, ccy),
    months: horizon,
    total: roundMoney(opportunityMonthly * horizon, ccy),
    method,
    categories: [...new Set(discretionaryCats)],
  };

  // Insights, most useful first. Neutral wording lives in the message catalogue.
  const insights: Insight[] = [];
  if (expenses > income && income > 0) insights.push({ code: "net_negative", params: { amount: r2(expenses - income), currency: ccy }, basis: "income vs expenses" });
  else if (income > expenses) insights.push({ code: "net_positive", params: { amount: r2(income - expenses), currency: ccy }, basis: "income vs expenses" });
  insights.push(...categoryAboveAverage.slice(0, 2));
  if (subscriptions.count) insights.push({ code: "subscriptions", params: { count: subscriptions.count, amount: subscriptions.monthly_cost, currency: ccy }, basis: "recurring payment detection" });
  if (expenses > 0) {
    const core = categories.filter((c) => ["Accommodation", "Food", "Transportation"].includes(c.category)).reduce((s, c) => s + c.amount, 0);
    if (core > 0) insights.push({ code: "essentials_share", params: { pct: Math.round((core / expenses) * 100) }, basis: "category shares" });
  }
  if (unusual[0]) insights.push({ code: "unusual_payment", params: { merchant: unusual[0].merchant, amount: unusual[0].amount, date: unusual[0].date, category: unusual[0].category, scope: unusual[0].scope ?? "category", typical: unusual[0].typical, currency: ccy }, basis: "outlier check" });
  const regular = income_sources.find((s) => s.regular);
  if (regular) insights.push({ code: "regular_income", params: { source: regular.source, amount: r2(regular.total / months), currency: ccy }, basis: "income pattern" });
  if (obligation && projected != null) {
    insights.push({
      code: covered ? "projection_covered" : "projection_short",
      params: { amount: Math.abs(projected), obligation: obligation.title, date: obligation.due_date, currency: ccy },
      basis: "cash-flow projection",
    });
  }
  if (opportunity.monthly >= 5) {
    insights.push({ code: "opportunity", params: { monthly: opportunity.monthly, total: opportunity.total, months: opportunity.months, currency: ccy }, basis: `estimated opportunity (${method})` });
  }

  return {
    currency: ccy,
    period: { start, end, days, months },
    totals: { income, expenses, net: r2(income - expenses), essential, discretionary, transfers_out: r2(transfersOut.reduce((s, r) => s - r.value, 0)) },
    monthly,
    categories,
    top_merchants,
    recurring,
    subscriptions,
    unusual: unusual.slice(0, 5),
    income_sources,
    opportunity,
    pressure: { obligation, cash_now: cashNow, monthly_net: monthlyNet, projected_available: projected, covered },
    insights,
    rows_analysed: included.length,
    rows_excluded: rows.length - included.length,
    low_confidence: rows.filter((r) => r.included && r.needs_review).length,
    is_estimate: true,
  };
}
