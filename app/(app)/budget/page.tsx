import Link from "next/link";
import { FileSearch } from "lucide-react";
import { CalendarClock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getRepository } from "@/lib/session";
import { getFxService } from "@/lib/finance";
import { summarizeBudget, type BudgetSummary } from "@/lib/budget/insights";
import { formatMoney } from "@/lib/fx/service";
import { PageHeader } from "@/components/page-header";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { SpendingDonut } from "@/components/spending-donut";
import { CATEGORY, CategoryIcon } from "@/components/caimao/category";
import { SectionTitle } from "@/components/page-header";
import { TransactionRow } from "@/components/caimao/transaction-row";
import { MascotInsightCard } from "@/components/caimao/mascot-insight-card";
import { ShowMore } from "@/components/caimao/show-more";
import { cn, daysFromToday, formatDate } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("BudgetPage");
  return { title: t("metaTitle") };
}

const round = (n: number) => Math.round(n).toLocaleString("en-GB");

/** A translator for one namespace ("BudgetPage" or "Categories"). */
type T = (key: string, values?: Record<string, string | number>) => string;

/** Same wording as dueText() in lib/utils, from messages. */
function dueLabel(t: T, days: number) {
  if (days === 0) return t("due.today");
  if (days < 0) return t("due.overdue", { days: -days });
  return t("due.inDays", { days });
}

/** Conversational, non-judgmental insights built from the same budget summary the agent uses. */
function friendlyInsights(s: BudgetSummary, t: T, tcat: T): string[] {
  const c = s.currency;
  const out: string[] = [];
  const notable = s.categories
    .filter((x) => x.change_pct != null && Math.abs(x.change_pct) >= 0.1 && Math.abs(x.amount - x.prior_avg) >= 10)
    .sort((a, b) => Math.abs(b.amount - b.prior_avg) - Math.abs(a.amount - a.prior_avg));
  for (const x of notable.slice(0, 2)) {
    const diff = x.amount - x.prior_avg;
    out.push(t("insights.spentVsUsual", { currency: c, amount: round(Math.abs(diff)), direction: diff > 0 ? "more" : "less", category: tcat(x.category).toLowerCase() }));
  }
  const steady = s.categories.find((x) => x.change_pct != null && Math.abs(x.change_pct) < 0.05 && x.amount > 0);
  if (steady) out.push(t("insights.steady", { category: tcat(steady.category) }));
  if (s.upcoming_obligations.length) {
    out.push(t("insights.afterBills", { bills: formatMoney(s.upcoming_total, c), currency: c, amount: round(s.available_after_obligations) }));
  }
  return out;
}

export default async function BudgetPage() {
  const t = await getTranslations("BudgetPage");
  const tcat = await getTranslations("Categories");
  const repo = await getRepository();
  const [transactions, accounts, obligations, budgets, profile, fx] = await Promise.all([
    repo.listTransactions(),
    repo.listAccounts(),
    repo.listObligations(),
    repo.listBudgets(),
    repo.getProfile(),
    getFxService(repo),
  ]);
  const s = summarizeBudget({ transactions, accounts, obligations, budgets, fx, currency: profile.study_currency });
  const c = s.currency;
  const cats = s.categories.filter((x) => x.amount > 0 || x.budget).sort((a, b) => b.amount - a.amount);
  const spend = cats.filter((x) => x.amount > 0).map((x) => ({ category: x.category, amount: x.amount }));
  const plan = s.categories.reduce((sum, x) => sum + (x.budget ?? 0), 0);
  const budgetedSpend = s.categories.filter((x) => x.budget).reduce((sum, x) => sum + x.amount, 0);
  const remaining = plan - budgetedSpend;
  const insights = friendlyInsights(s, t, tcat);
  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? a.name : undefined;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title", { month: formatDate(s.window_end, { month: "long" }) })}
        description={t("description")}
        action={
          <Link href="/budget/statement" className="cm-press cm-cta inline-flex h-12 items-center gap-2 rounded-[16px] px-5 text-[15px] font-extrabold">
            <FileSearch className="size-5" aria-hidden /> {t("analyseStatement")}
          </Link>
        }
      />

      {/* Hero */}
      <section className="grid grid-cols-1 items-center gap-6 rounded-[28px] bg-white p-6 shadow-card sm:p-8 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="text-[14px] text-muted">
            {t("windowLine", { start: formatDate(s.window_start, { day: "numeric", month: "short" }), end: formatDate(s.window_end, { day: "numeric", month: "short" }) })}
          </div>
          <div className="mt-2 flex items-baseline gap-2 font-display">
            <span className="text-[18px] font-medium text-muted">{c}</span>
            <span className="num text-[48px] font-extrabold leading-none tracking-[-0.05em] text-cocoa sm:text-[56px]">{round(s.expenses)}</span>
            <span className="text-[16px] text-muted">{t("spent")}</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] bg-gold-soft p-4">
              <div className="text-[13px] text-gold-ink">{t("leftInPlan")}</div>
              <Money amount={remaining} currency={c} className="text-[20px] font-extrabold text-cocoa" />
              <div className="text-[12.5px] text-muted">{t("ofPlanTotal", { plan: formatMoney(plan, c) })}</div>
            </div>
            <div className="rounded-[20px] bg-peach-soft p-4">
              <div className="text-[13px] text-peach-ink">{t("moneyIn")}</div>
              <Money amount={s.income} currency={c} className="text-[20px] font-extrabold text-cocoa" />
              <div className="text-[12.5px] text-muted">{t("thisMonth")}</div>
            </div>
            <div className="col-span-2 rounded-[20px] bg-brand-soft p-4 sm:col-span-1">
              <div className="text-[13px] text-brand">{t("netSaved")}</div>
              <Money amount={s.savings} currency={c} className="text-[20px] font-extrabold text-cocoa" />
              <div className="text-[12.5px] text-muted">{s.obligations_paid > 0 ? t("afterBillsPaid", { amount: formatMoney(s.obligations_paid, c) }) : t("afterSpending")}</div>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[240px]"><SpendingDonut data={spend} currency={c} total={s.expenses} height={220} /></div>
      </section>

      {/* AI insights */}
      {insights.length > 0 && (
        <MascotInsightCard
          headline={insights[0]}
          body={
            insights.length > 1 ? (
              <ul className="mt-1 space-y-1.5">
                {insights.slice(1).map((i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
            ) : undefined
          }
          actions={[{ href: "/copilot?q=Review%20my%20spending", label: t("talkItThrough") }]}
          layout="inline"
        />
      )}

      {/* Categories */}
      <section>
        <SectionTitle title={t("byCategory")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((x) => {
            const share = s.expenses ? x.amount / s.expenses : 0;
            const ofPlan = x.budget ? x.amount / x.budget : null;
            const diff = x.change_pct != null ? x.amount - x.prior_avg : null;
            return (
              <article key={x.category} className="cm-lift rounded-[24px] bg-white p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <CategoryIcon category={x.category} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15.5px] font-extrabold text-cocoa">{tcat(x.category)}</div>
                    <div className="text-[13px] text-muted">{t("shareOfSpending", { pct: Math.round(share * 100) })}</div>
                  </div>
                  <Money amount={x.amount} currency={c} className="text-[17px] font-extrabold text-cocoa" />
                </div>
                {x.budget ? (
                  <div className="mt-4">
                    <div className="h-2.5 overflow-hidden rounded-full bg-cream">
                      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (ofPlan ?? 0) * 100)}%`, background: CATEGORY[x.category].color }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[13px] text-muted">
                      <span>{t("pctOfPlan", { pct: Math.round((ofPlan ?? 0) * 100), plan: formatMoney(x.budget, c) })}</span>
                      {ofPlan != null && ofPlan > 1 ? <span className="font-medium text-warning-ink">{t("over", { currency: c, amount: round(x.amount - x.budget) })}</span> : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-[13px] text-muted">{t("noPlan")}</div>
                )}
                {diff != null && Math.abs(diff) >= 5 ? (
                  <p className="mt-2 text-[13px] text-cocoa-2">
                    {t("vsUsual", { currency: c, amount: round(Math.abs(diff)), direction: diff > 0 ? "more" : "less" })}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <SectionTitle title={t("billsComingUp")} href="/obligations" />
          <ul className="space-y-3">
            {s.upcoming_obligations.length === 0 && <li className="rounded-[22px] bg-white p-5 text-[15px] text-muted shadow-card">{t("nothingDue")}</li>}
            {s.upcoming_obligations.map((o) => {
              const d = daysFromToday(o.due_date);
              return (
                <li key={o.id} className={cn("flex items-center gap-3 rounded-[22px] bg-white p-4 shadow-card")}>
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px]", d <= 7 ? "bg-warning-soft text-warning-ink" : "bg-cream text-cocoa-2")}>
                    <CalendarClock className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold text-cocoa">{o.title}</div>
                    <div className="text-[13px] text-muted">{dueLabel(t, d)}</div>
                  </div>
                  <div className="text-right">
                    <Money amount={o.amount} currency={o.currency} className="text-[15px] font-extrabold" />
                    <div className="mt-0.5"><StatusBadge status={o.status} size="sm" /></div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 px-1 text-[14px] text-cocoa-2">
            {t.rich("freeAfter", { amount: formatMoney(s.available_after_obligations, c), b: (chunks) => <span className="num font-extrabold">{chunks}</span> })}
          </p>
        </section>

        <section className="lg:col-span-7">
          <SectionTitle title={t("transactions")} />
          <div className="rounded-[24px] bg-white p-3 shadow-card sm:p-4">
            <ShowMore initial={8} label={t("showAll", { count: transactions.length })}>
              {transactions.map((t) => (
                <TransactionRow key={t.id} t={t} account={accountName(t.account_id)} />
              ))}
            </ShowMore>
          </div>
        </section>
      </div>
    </div>
  );
}
