import type { Account, Budget, Currency, Obligation, Transaction, TransactionCategory } from "../types";
import { formatMoney, roundMoney, type FxService } from "../fx/service";
import { SPENDING_CATEGORIES } from "./classifier";

/**
 * Budget analytics over a trailing 30-day window, compared with the three
 * 30-day windows before it. Language stays neutral and descriptive.
 */
const DAY = 86_400_000;

export interface CategoryLine {
  category: Exclude<TransactionCategory, "Income">;
  amount: number;
  prior_avg: number;
  change_pct: number | null;
  budget: number | null;
}

export interface BudgetSummary {
  currency: Currency;
  window_start: string;
  window_end: string;
  income: number;
  expenses: number;
  /** Obligations settled through CaiMao (e.g. tuition). Reported separately so one-off payments don't distort everyday spending. */
  obligations_paid: number;
  savings: number;
  savings_rate: number | null;
  categories: CategoryLine[];
  upcoming_obligations: { id: string; title: string; amount: number; currency: Currency; amount_converted: number; due_date: string; status: Obligation["status"] }[];
  upcoming_total: number;
  total_cash: number;
  available_after_obligations: number;
  insights: string[];
}

function windowIndex(date: string, now: Date): number {
  const days = Math.floor((now.getTime() - new Date(date + "T12:00:00Z").getTime()) / DAY);
  return days < 0 ? 0 : Math.floor(days / 30);
}

export function summarizeBudget(input: {
  transactions: Transaction[];
  accounts: Account[];
  obligations: Obligation[];
  budgets: Budget[];
  fx: FxService;
  currency: Currency;
  now?: Date;
}): BudgetSummary {
  const { transactions, accounts, obligations, budgets, fx, currency } = input;
  const now = input.now ?? new Date();
  const conv = (t: { amount: number; currency: Currency }) => fx.convert(t.amount, t.currency, currency);

  const windows: Record<number, Map<TransactionCategory, number>> = { 0: new Map(), 1: new Map(), 2: new Map(), 3: new Map() };
  let income = 0;
  let expenses = 0;
  let obligationsPaid = 0;
  for (const t of transactions) {
    const w = windowIndex(t.date, now);
    if (w > 3) continue;
    const amt = conv(t);
    if (t.category_source === "system") {
      if (w === 0 && amt < 0) obligationsPaid += -amt;
      continue;
    }
    if (w === 0) {
      // Transfers between the user's own accounts are neither income nor spending.
      if (t.category === "Income" && amt > 0) income += amt;
      else if (t.category !== "Transfers" && amt < 0) expenses += -amt;
    }
    if (amt < 0 && t.category !== "Income") windows[w].set(t.category, (windows[w].get(t.category) ?? 0) - amt);
  }

  const categories: CategoryLine[] = SPENDING_CATEGORIES.map((category) => {
    const amount = windows[0].get(category) ?? 0;
    const priors = [1, 2, 3].map((w) => windows[w].get(category) ?? 0);
    const consistent = priors.every((p) => p > 0);
    const prior_avg = priors.reduce((a, b) => a + b, 0) / 3;
    const budget = budgets.find((b) => b.category === category);
    return {
      category,
      amount: roundMoney(amount, currency),
      prior_avg: roundMoney(prior_avg, currency),
      change_pct: consistent && prior_avg > 0 ? (amount - prior_avg) / prior_avg : null,
      budget: budget ? roundMoney(fx.convert(budget.monthly_limit, budget.currency, currency), currency) : null,
    };
  });

  const horizon = now.getTime() + 31 * DAY;
  const upcoming = obligations
    .filter((o) => o.status !== "PAID" && new Date(o.due_date).getTime() <= horizon)
    .map((o) => ({
      id: o.id,
      title: o.title,
      amount: o.amount,
      currency: o.currency,
      amount_converted: roundMoney(fx.convert(o.amount, o.currency, currency), currency),
      due_date: o.due_date,
      status: o.status,
    }));
  const upcoming_total = roundMoney(upcoming.reduce((s, o) => s + o.amount_converted, 0), currency);
  const total_cash = roundMoney(accounts.reduce((s, a) => s + fx.convert(a.balance, a.currency, currency), 0), currency);

  const summary: BudgetSummary = {
    currency,
    window_start: new Date(now.getTime() - 29 * DAY).toISOString().slice(0, 10),
    window_end: now.toISOString().slice(0, 10),
    income: roundMoney(income, currency),
    expenses: roundMoney(expenses, currency),
    obligations_paid: roundMoney(obligationsPaid, currency),
    savings: roundMoney(income - expenses - obligationsPaid, currency),
    savings_rate: income > 0 ? (income - expenses - obligationsPaid) / income : null,
    categories,
    upcoming_obligations: upcoming,
    upcoming_total,
    total_cash,
    available_after_obligations: roundMoney(total_cash - upcoming_total, currency),
    insights: [],
  };
  summary.insights = buildInsights(summary);
  return summary;
}

function buildInsights(s: BudgetSummary): string[] {
  const out: string[] = [];
  const c = s.currency;
  const notable = s.categories
    .filter((x) => x.change_pct != null && Math.abs(x.change_pct) >= 0.1)
    .sort((a, b) => Math.abs(b.change_pct!) - Math.abs(a.change_pct!));
  for (const x of notable.slice(0, 2)) {
    const pct = Math.round(Math.abs(x.change_pct!) * 100);
    out.push(
      `You have spent ${pct}% ${x.change_pct! > 0 ? "more" : "less"} on ${x.category.toLowerCase()} than your three-month average (${formatMoney(x.amount, c)} vs ${formatMoney(x.prior_avg, c)}).`,
    );
  }
  const steady = s.categories.find((x) => x.change_pct != null && Math.abs(x.change_pct) < 0.05);
  if (steady) out.push(`${steady.category} spending is in line with your recent average.`);
  const nearBudget = s.categories
    .filter((x) => x.budget && x.amount / x.budget >= 0.8)
    .sort((a, b) => b.amount / b.budget! - a.amount / a.budget!)[0];
  if (nearBudget) {
    out.push(`${nearBudget.category} is at ${Math.round((nearBudget.amount / nearBudget.budget!) * 100)}% of its ${formatMoney(nearBudget.budget!, c)} monthly budget.`);
  }
  if (s.upcoming_obligations.length) {
    out.push(
      `After the ${formatMoney(s.upcoming_total, c)} of obligations due in the next 30 days, about ${formatMoney(s.available_after_obligations, c)} would remain across your accounts.`,
    );
  }
  return out;
}
