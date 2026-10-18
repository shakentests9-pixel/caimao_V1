"use client";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Repeat, Sparkles, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { Money } from "@/components/money";
import { CATEGORY, CategoryIcon } from "@/components/caimao/category";
import { MascotInsightCard } from "@/components/caimao/mascot-insight-card";
import { formatMoney } from "@/lib/fx/service";
import type { Currency } from "@/lib/types";
import type { Insight, StatementAnalysis } from "@/lib/statements/analyse";
import { cn } from "@/lib/utils";

/** Renders one insight code in the user's language. Money is formatted the same way in every language. */
export function useInsightText() {
  const t = useTranslations("StatementInsights");
  const tg = useTranslations("StatementPage.groups");
  const tcat = useTranslations("Categories");
  const format = useFormatter();
  return (i: Insight) => {
    const p = i.params;
    const ccy = (p.currency as Currency) ?? "GBP";
    const m = (k: string) => formatMoney(Number(p[k] ?? 0), ccy);
    const date = (k: string) => format.dateTime(new Date(String(p[k]) + "T12:00:00Z"), { day: "numeric", month: "long" });
    switch (i.code) {
      case "category_above_average":
        return t("category_above_average", {
          category: tg.has(String(p.category)) ? tg(String(p.category)) : String(p.category),
          month: format.dateTime(new Date(String(p.month) + "-15T12:00:00Z"), { month: "long" }),
          amount: m("amount"),
          diff: m("diff"),
          months: Number(p.months),
        });
      case "subscriptions":
        return t("subscriptions", { count: Number(p.count), amount: m("amount") });
      case "essentials_share":
        return t("essentials_share", { pct: Number(p.pct) });
      case "unusual_payment":
        return t("unusual_payment", { merchant: String(p.merchant), amount: m("amount"), date: date("date"), category: tcat(String(p.category) as never) });
      case "regular_income":
        return t("regular_income", { source: String(p.source), amount: m("amount") });
      case "projection_covered":
      case "projection_short":
        return t(i.code, { amount: m("amount"), obligation: String(p.obligation), date: date("date") });
      case "opportunity":
        return t("opportunity", { monthly: m("monthly"), total: m("total"), months: Number(p.months) });
      case "net_negative":
      case "net_positive":
        return t(i.code, { amount: m("amount") });
    }
  };
}

export function StatementAnalysisView({ analysis, onAsk }: { analysis: StatementAnalysis; onAsk?: string }) {
  const t = useTranslations("StatementPage");
  const tc = useTranslations("Categories");
  const format = useFormatter();
  const text = useInsightText();
  const a = analysis;
  const ccy = a.currency;
  const period = `${format.dateTime(new Date(a.period.start + "T12:00:00Z"), { day: "numeric", month: "short" })} – ${format.dateTime(new Date(a.period.end + "T12:00:00Z"), { day: "numeric", month: "short", year: "numeric" })}`;
  const [lead, ...rest] = a.insights;

  return (
    <div className="space-y-6">
      {/* Statement summary */}
      <section aria-labelledby="summary-title" className="rounded-[28px] bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="summary-title" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("summary.title")}</h2>
          <span className="text-[13.5px] text-muted">{t("summary.period", { period, count: a.rows_analysed })}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile icon={<ArrowDownLeft className="size-4" />} label={t("summary.income")} tone="success">
            <Money amount={a.totals.income} currency={ccy} />
          </Tile>
          <Tile icon={<ArrowUpRight className="size-4" />} label={t("summary.expenses")} tone="peach">
            <Money amount={a.totals.expenses} currency={ccy} />
          </Tile>
          <Tile icon={<Wallet className="size-4" />} label={t("summary.net")} tone={a.totals.net >= 0 ? "success" : "warning"}>
            <Money amount={a.totals.net} currency={ccy} sign />
          </Tile>
          <Tile icon={<Repeat className="size-4" />} label={t("summary.recurring")} tone="cream" sub={t("summary.perMonth", { amount: formatMoney(a.recurring.reduce((s, r) => s + r.monthly_cost, 0), ccy) })}>
            {t("summary.payments", { count: a.recurring.length })}
          </Tile>
          <Tile icon={<Sparkles className="size-4" />} label={t("summary.opportunity")} tone="gold" sub={t("summary.opportunityNote")} className="col-span-2 lg:col-span-1">
            <span>
              <Money amount={a.opportunity.monthly} currency={ccy} />
              <span className="text-[13px] font-semibold text-muted"> {t("summary.perMonthShort")}</span>
            </span>
          </Tile>
        </dl>
        <p className="mt-3 text-[12.5px] leading-5 text-muted">
          {a.opportunity.method === "above_average" ? t("summary.methodAverage") : t("summary.methodIllustrative")} {t("summary.estimateNote")}
        </p>
      </section>

      {/* CaiMao insights */}
      {lead ? (
        <MascotInsightCard
          headline={text(lead)}
          body={
            rest.length ? (
              <ul className="mt-1 space-y-1.5">
                {rest.map((i, k) => (
                  <li key={k} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                    <span>{text(i)}</span>
                  </li>
                ))}
              </ul>
            ) : undefined
          }
          note={t("insightsNote")}
          actions={onAsk ? [{ href: onAsk, label: t("askCaiMao"), primary: true }] : undefined}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category breakdown */}
        <section aria-labelledby="cat-title" className="rounded-[24px] bg-white p-5 shadow-card">
          <h3 id="cat-title" className="font-display text-[19px] font-extrabold text-cocoa">{t("categoriesTitle")}</h3>
          <p className="text-[13px] text-muted">{t("essentialSplit", { essential: formatMoney(a.totals.essential, ccy), discretionary: formatMoney(a.totals.discretionary, ccy) })}</p>
          <ul className="mt-4 space-y-3">
            {a.categories.map((c) => (
              <li key={c.category}>
                <div className="flex items-center gap-3">
                  <CategoryIcon category={c.category} size={36} />
                  <span className="flex-1 text-[14.5px] font-bold text-cocoa">
                    {tc(c.category)} <span className="font-semibold text-muted">· {Math.round(c.share * 100)}%</span>
                  </span>
                  <Money amount={c.amount} currency={ccy} className="text-[14.5px] font-extrabold text-cocoa" />
                </div>
                <div className="ml-12 mt-1.5 h-2 overflow-hidden rounded-full bg-cream" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, c.share * 100)}%`, background: CATEGORY[c.category].color }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          {/* Top merchants */}
          <section aria-labelledby="merch-title" className="rounded-[24px] bg-white p-5 shadow-card">
            <h3 id="merch-title" className="font-display text-[19px] font-extrabold text-cocoa">{t("merchantsTitle")}</h3>
            <ol className="mt-3 divide-y divide-line">
              {a.top_merchants.slice(0, 6).map((m, i) => (
                <li key={m.merchant} className="flex items-center gap-3 py-2.5">
                  <span className="num w-5 text-[13px] font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-cocoa">{m.merchant}</span>
                    <span className="block text-[12.5px] text-muted">{t("merchantCount", { count: m.count })} · {tc(m.category)}</span>
                  </span>
                  <Money amount={m.amount} currency={ccy} className="text-[14.5px] font-extrabold text-cocoa" />
                </li>
              ))}
            </ol>
          </section>

          {/* Upcoming pressure */}
          {a.pressure.obligation ? (
            <section aria-labelledby="pressure-title" className={cn("rounded-[24px] p-5 shadow-card", a.pressure.covered ? "bg-white" : "bg-warning-soft")}>
              <h3 id="pressure-title" className="flex items-center gap-2 font-display text-[19px] font-extrabold text-cocoa">
                <CalendarClock className="size-5 text-brand" aria-hidden /> {t("pressure.title")}
              </h3>
              <p className="mt-1.5 text-[14.5px] leading-6 text-cocoa-2">
                {t("pressure.body", {
                  obligation: a.pressure.obligation.title,
                  amount: formatMoney(a.pressure.obligation.amount, a.pressure.obligation.currency),
                  days: a.pressure.obligation.days,
                })}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Mini label={t("pressure.cashNow")} value={formatMoney(a.pressure.cash_now, ccy)} />
                <Mini label={t("pressure.monthlyNet")} value={formatMoney(a.pressure.monthly_net, ccy, { sign: true })} />
                <Mini label={t("pressure.projected")} value={formatMoney(a.pressure.projected_available ?? 0, ccy, { sign: true })} strong />
              </dl>
              <p className="mt-2 text-[12.5px] text-muted">{t("pressure.note")}</p>
            </section>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recurring payments */}
        <section aria-labelledby="rec-title" className="rounded-[24px] bg-white p-5 shadow-card">
          <h3 id="rec-title" className="flex items-center gap-2 font-display text-[19px] font-extrabold text-cocoa">
            <Repeat className="size-5 text-brand" aria-hidden /> {t("recurringTitle")}
          </h3>
          {a.recurring.length ? (
            <ul className="mt-3 divide-y divide-line">
              {a.recurring.map((r) => (
                <li key={r.merchant} className="flex items-center gap-3 py-2.5">
                  <CategoryIcon category={r.category} merchant={r.merchant} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-cocoa">{r.merchant}</span>
                    <span className="block text-[12.5px] text-muted">
                      {t(`cadence.${r.cadence}`)} · {t("seenTimes", { count: r.occurrences })}
                      {r.is_subscription ? ` · ${t("subscription")}` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <Money amount={r.monthly_cost} currency={ccy} className="block text-[14.5px] font-extrabold text-cocoa" />
                    <span className="text-[11.5px] text-muted">{t("summary.perMonthShort")}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-muted">{t("noRecurring")}</p>
          )}
        </section>

        <div className="space-y-6">
          {/* Unusual expenses */}
          <section aria-labelledby="unusual-title" className="rounded-[24px] bg-white p-5 shadow-card">
            <h3 id="unusual-title" className="flex items-center gap-2 font-display text-[19px] font-extrabold text-cocoa">
              <TriangleAlert className="size-5 text-warning-ink" aria-hidden /> {t("unusualTitle")}
            </h3>
            {a.unusual.length ? (
              <ul className="mt-3 space-y-2">
                {a.unusual.map((u) => (
                  <li key={u.id} className="rounded-[16px] bg-cream px-4 py-3 text-[14px] text-cocoa-2">
                    <span className="font-bold text-cocoa">{u.merchant}</span> · <Money amount={u.amount} currency={ccy} className="font-bold" /> ·{" "}
                    {format.dateTime(new Date(u.date + "T12:00:00Z"), { day: "numeric", month: "short" })}
                    <span className="block text-[12.5px] text-muted">{t("unusualWhy", { typical: formatMoney(u.typical, ccy), category: tc(u.category) })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-muted">{t("noUnusual")}</p>
            )}
          </section>

          {/* Income pattern */}
          <section aria-labelledby="income-title" className="rounded-[24px] bg-white p-5 shadow-card">
            <h3 id="income-title" className="flex items-center gap-2 font-display text-[19px] font-extrabold text-cocoa">
              <TrendingUp className="size-5 text-success-ink" aria-hidden /> {t("incomeTitle")}
            </h3>
            <ul className="mt-3 divide-y divide-line">
              {a.income_sources.map((s) => (
                <li key={s.source} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-bold text-cocoa">{s.source}</span>
                    <span className="block text-[12.5px] text-muted">{s.regular ? t("regular") : t("oneOff")} · {t("seenTimes", { count: s.occurrences })}</span>
                  </span>
                  <Money amount={s.total} currency={ccy} className="text-[14.5px] font-extrabold text-success-ink" />
                </li>
              ))}
            </ul>
            {a.monthly.length > 1 ? (
              <div className="mt-4 grid grid-cols-3 gap-2" aria-label={t("monthlyFlow")}>
                {a.monthly.map((mo) => (
                  <div key={mo.month} className="rounded-[14px] bg-cream px-3 py-2 text-center">
                    <div className="text-[12px] font-bold text-muted">{format.dateTime(new Date(mo.month + "-15T12:00:00Z"), { month: "short" })}</div>
                    <div className="num text-[13px] font-extrabold text-success-ink">+{formatMoney(mo.income, ccy).replace(`${ccy} `, "")}</div>
                    <div className="num text-[13px] font-extrabold text-cocoa">−{formatMoney(mo.expenses, ccy).replace(`${ccy} `, "")}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <p className="text-center text-[12.5px] text-muted">{t("disclaimer")}</p>
      <p className="sr-only">
        <Link href="/budget">{t("backToBudget")}</Link>
      </p>
    </div>
  );
}

function Tile({ icon, label, children, sub, tone, className }: { icon: React.ReactNode; label: string; children: React.ReactNode; sub?: string; tone: "success" | "peach" | "warning" | "cream" | "gold"; className?: string }) {
  const tones = { success: "bg-success-soft text-success-ink", peach: "bg-peach-soft text-peach-ink", warning: "bg-warning-soft text-warning-ink", cream: "bg-cream text-cocoa-2", gold: "bg-gold-soft text-gold-ink" };
  return (
    <div className={cn("rounded-[20px] p-4", tone === "cream" ? "bg-cream" : tone === "gold" ? "bg-gold-soft" : tone === "success" ? "bg-success-soft/60" : tone === "warning" ? "bg-warning-soft" : "bg-peach-soft", className)}>
      <dt className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa-2">
        <span className={cn("flex size-6 items-center justify-center rounded-full", tones[tone])}>{icon}</span>
        {label}
      </dt>
      <dd className="mt-1.5 font-display text-[19px] font-extrabold text-cocoa">{children}</dd>
      {sub ? <dd className="text-[12px] text-muted">{sub}</dd> : null}
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-[14px] bg-white/70 px-2 py-2.5">
      <dt className="text-[11.5px] font-bold text-muted">{label}</dt>
      <dd className={cn("num text-[13.5px] font-extrabold", strong ? "text-brand" : "text-cocoa")}>{value}</dd>
    </div>
  );
}
