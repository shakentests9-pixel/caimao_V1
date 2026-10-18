import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftRight, Bell, GraduationCap, RefreshCw, Sparkles } from "lucide-react";
import { getRepository } from "@/lib/session";
import { getFxService } from "@/lib/finance";
import { loadTuitionInsight, totalIn } from "@/lib/views";
import { summarizeBudget } from "@/lib/budget/insights";
import type { Currency } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { Avatar } from "@/components/brand";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import { SpendingDonut } from "@/components/spending-donut";
import { SectionTitle } from "@/components/page-header";
import { Greeting } from "@/components/caimao/greeting";
import { HeroBalanceCard } from "@/components/caimao/hero-balance-card";
import { MascotInsightCard } from "@/components/caimao/mascot-insight-card";
import { QuickActionGrid } from "@/components/caimao/quick-action-grid";
import { AccountCard } from "@/components/caimao/account-card";
import { ObligationTimeline } from "@/components/caimao/obligation-timeline";
import { TransactionRow } from "@/components/caimao/transaction-row";
import { CATEGORY } from "@/components/caimao/category";
import { Money } from "@/components/money";

export async function generateMetadata() {
  const t = await getTranslations("HomePage");
  return { title: t("metaTitle") };
}

export default async function Home() {
  const t = await getTranslations("HomePage");
  const tc = await getTranslations("Countries");
  const repo = await getRepository();
  const [profile, accounts, obligations, transactions, budgets, fx] = await Promise.all([
    repo.getProfile(),
    repo.listAccounts(),
    repo.listObligations(),
    repo.listTransactions(),
    repo.listBudgets(),
    getFxService(repo),
  ]);
  const base = profile.base_currency;
  const total = totalIn(accounts, fx, base);
  const insight = await loadTuitionInsight(repo, profile, accounts, obligations, fx);
  const budget = summarizeBudget({ transactions, accounts, obligations, budgets, fx, currency: profile.study_currency });
  const spend = budget.categories.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);

  // One tile per currency held: native amount plus its share of the total.
  const byCurrency = new Map<Currency, { amount: number; inBase: number }>();
  for (const a of accounts) {
    const cur = byCurrency.get(a.currency) ?? { amount: 0, inBase: 0 };
    byCurrency.set(a.currency, { amount: cur.amount + a.balance, inBase: cur.inBase + fx.convert(a.balance, a.currency, base) });
  }
  const holdings = [...byCurrency.entries()].map(([currency, v]) => ({ currency, amount: v.amount, share: total ? v.inBase / total : 0 }));

  const upcoming = obligations.filter((o) => o.status !== "PAID");
  const paidTuition = obligations.find((o) => o.kind === "tuition" && o.status === "PAID");
  const timeline = [...upcoming, ...(paidTuition ? [paidTuition] : [])].slice(0, 4);
  const dueCount = obligations.filter((o) => o.status === "PAYMENT_DUE").length;

  return (
    <div className="space-y-6 lg:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-1">
        <div>
          <Greeting firstName={profile.full_name.split(" ")[0]} />
          <p className="mt-1.5 text-[15.5px] text-muted">
            {tc(profile.home_country)} → {tc(profile.study_country)} · <span className="font-bold text-brand">{profile.university}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BaseCurrencySelect value={base} />
          <Link href="/obligations" className="cm-press relative flex size-11 items-center justify-center rounded-[15px] bg-white text-cocoa shadow-card" aria-label={t("notifications", { count: dueCount })}>
            <Bell className="size-5" />
            {dueCount > 0 && <span className="num absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-gold text-[11px] font-extrabold text-cocoa ring-2 ring-ivory">{dueCount}</span>}
          </Link>
          <Link href="/profile" className="cm-press hidden sm:block" aria-label={t("profile")}>
            <Avatar name={profile.full_name} size={44} />
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <HeroBalanceCard total={total} currency={base} accountCount={accounts.length} holdings={holdings} />
        </div>
        <div className="lg:col-span-5">
          {insight.state === "due" ? (
            <MascotInsightCard
              className="h-full"
              headline={t("insight.dueHeadline", { days: insight.days })}
              body={
                insight.sufficient
                  ? insight.extra_vs_worst
                    ? t("insight.betterRoute", {
                        currency: insight.obligation.currency,
                        amount: Math.round(insight.extra_vs_worst).toLocaleString("en-GB"),
                        payee: insight.obligation.payee.replace(" Treasury", ""),
                        source: insight.source?.name ?? t("insight.yourAccount"),
                      })
                    : t("insight.enoughToCover", { source: insight.source?.name ?? t("insight.yourAccount") })
                  : t("insight.notCovered", { source: insight.source?.name ?? t("insight.yourHomeAccount") })
              }
              note={insight.sufficient && insight.extra_vs_worst ? t("insight.estimateNote") : undefined}
              actions={[{ href: "/copilot?q=Pay%20my%20tuition", label: t("insight.seeOptions"), primary: true }]}
            />
          ) : insight.state === "paid" ? (
            <MascotInsightCard
              className="h-full"
              headline={t("insight.paidHeadline")}
              body={
                insight.execution
                  ? t("insight.onItsWay", {
                      amount: formatMoney(insight.execution.destination_amount, insight.execution.destination_currency),
                      recipient: insight.execution.recipient.replace(" Treasury", ""),
                    })
                  : t("insight.paymentComplete")
              }
              actions={[
                { href: "/evidence", label: t("insight.viewReceipt"), primary: true },
                { href: "/transfers", label: t("insight.viewTransfer") },
              ]}
            />
          ) : (
            <MascotInsightCard className="h-full" headline={t("insight.nothingDue")} body={t("insight.askMe")} actions={[{ href: "/copilot", label: t("askCaimao"), primary: true }]} />
          )}
        </div>
      </div>

      <QuickActionGrid
        items={[
          { href: "/transfers", label: t("actions.sendMoney"), icon: ArrowLeftRight, tone: "brand" },
          { href: "/copilot?q=Pay%20my%20tuition", label: t("actions.payTuition"), icon: GraduationCap, tone: "gold" },
          { href: `/transfers?from=${profile.home_currency}&to=${profile.study_currency}`, label: t("actions.exchange"), icon: RefreshCw, tone: "peach" },
          { href: "/copilot", label: t("askCaimao"), icon: Sparkles, tone: "cocoa" },
        ]}
      />

      <section>
        <SectionTitle title={t("yourAccounts")} />
        <div role="region" aria-label={t("yourAccounts")} tabIndex={0} className="cm-scroll-x -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0">
          {accounts.map((a, i) => (
            <AccountCard key={a.id} index={i} account={a} baseCurrency={base} converted={a.currency !== base ? fx.convert(a.balance, a.currency, base) : null} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <SectionTitle title={t("comingUp")} href="/obligations" />
          <div className="rounded-[24px] bg-white p-4 shadow-card sm:p-5">
            <ObligationTimeline
              items={timeline}
              action={(o) =>
                o.kind === "tuition" && o.status !== "PAID" ? (
                  <Link href="/copilot?q=Pay%20my%20tuition" className="cm-press cm-cta inline-flex h-9 items-center rounded-[12px] px-3.5 text-[13.5px] font-extrabold">
                    {t("payWithCaimao")}
                  </Link>
                ) : null
              }
            />
          </div>

          <div className="mt-6">
            <SectionTitle title={t("thisMonth")} href="/budget" linkLabel={t("budgetLink")} />
            <div className="flex items-center gap-4 rounded-[24px] bg-white p-4 shadow-card sm:gap-5 sm:p-5">
              <div className="w-[112px] shrink-0 sm:w-[132px]">
                <SpendingDonut data={spend} currency={budget.currency} total={budget.expenses} height={124} label={t("thirtyDays")} compact />
              </div>
              <ul className="min-w-0 flex-1 space-y-2.5">
                {spend.slice(0, 4).map((c) => (
                  <li key={c.category} className="flex items-center gap-2.5 text-[14px]">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY[c.category].color }} aria-hidden />
                    <span className="flex-1 truncate font-semibold text-cocoa-2">{t(`categories.${c.category}`)}</span>
                    <Money amount={c.amount} currency={budget.currency} className="font-extrabold text-cocoa" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7">
          <SectionTitle title={t("recentActivity")} href="/budget" />
          <div className="rounded-[24px] bg-white px-4 py-2 shadow-card sm:px-5">
            <ul>
              {transactions.slice(0, 7).map((tx) => (
                <TransactionRow key={tx.id} t={tx} />
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
