import { formatMoney } from "../fx/service";
import type { Currency } from "../types";
import type { Insight } from "./analyse";

type T = ((key: string, values?: Record<string, string | number>) => string) & { has?: (k: string) => boolean };

/** Renders an insight code in any language (used by the built-in planner; the UI has an equivalent hook). */
export function renderInsight(i: Insight, t: { insights: T; groups: T; categories: T }, dateLocale: string): string {
  const p = i.params;
  const ccy = ((p.currency as Currency) ?? "GBP") as Currency;
  const m = (k: string) => formatMoney(Number(p[k] ?? 0), ccy);
  const date = (k: string) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(String(p[k]) + "T12:00:00Z"));
  const month = (k: string) => new Intl.DateTimeFormat(dateLocale, { month: "long", timeZone: "UTC" }).format(new Date(String(p[k]) + "-15T12:00:00Z"));
  switch (i.code) {
    case "category_above_average":
      return t.insights("category_above_average", { category: t.groups(String(p.category)), month: month("month"), amount: m("amount"), diff: m("diff"), months: Number(p.months) });
    case "subscriptions":
      return t.insights("subscriptions", { count: Number(p.count), amount: m("amount") });
    case "essentials_share":
      return t.insights("essentials_share", { pct: Number(p.pct) });
    case "unusual_payment":
      return t.insights("unusual_payment", { merchant: String(p.merchant), amount: m("amount"), date: date("date"), category: t.categories(String(p.category)) });
    case "regular_income":
      return t.insights("regular_income", { source: String(p.source), amount: m("amount") });
    case "projection_covered":
    case "projection_short":
      return t.insights(i.code, { amount: m("amount"), obligation: String(p.obligation), date: date("date") });
    case "opportunity":
      return t.insights("opportunity", { monthly: m("monthly"), total: m("total"), months: Number(p.months) });
    case "net_negative":
    case "net_positive":
      return t.insights(i.code, { amount: m("amount") });
  }
}
