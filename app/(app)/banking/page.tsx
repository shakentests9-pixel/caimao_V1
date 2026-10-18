import { Check, Circle } from "lucide-react";
import { getRepository } from "@/lib/session";
import { formatMoney } from "@/lib/fx/service";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { CreditCardVisual } from "@/components/caimao/credit-card-visual";
import { BankSetupChecklist } from "@/components/caimao/bank-setup";
import { ChecklistCard } from "@/components/caimao/checklist-card";
import { MascotInsightCard } from "@/components/caimao/mascot-insight-card";
import { cn, daysFromToday, formatDate } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("BankingPage");
  return { title: t("metaTitle") };
}

/** Message keys for the spelled-out day counts (numberWords.*). */
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Countries shown by a short name (studyShort.*) rather than the full country name. */
const SHORT = ["GB", "US"];

export default async function BankingPage() {
  const repo = await getRepository();
  const [[card], checklist, profile, accounts] = await Promise.all([repo.listCreditCards(), repo.listChecklist(), repo.getProfile(), repo.listAccounts()]);
  const [t, tc] = await Promise.all([getTranslations("BankingPage"), getTranslations("Countries")]);
  const study = SHORT.includes(profile.study_country) ? t(`studyShort.${profile.study_country}`) : tc(profile.study_country);
  const utilisation = card ? card.current_balance / card.credit_limit : 0;
  const due = card ? daysFromToday(card.payment_due_date) : 0;
  const onTime = card?.payment_history.filter((h) => h.status === "ON_TIME").length ?? 0;
  const late = card?.payment_history.some((h) => h.status === "LATE") ?? false;
  const localAccount = accounts.find((a) => a.country === profile.study_country);

  return (
    <div className="space-y-10">
      <PageHeader title={t("title")} description={t("description", { study })} />

      {card && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-8">
          <section>
            <CreditCardVisual card={card} />
            <dl className="mt-5 grid max-w-[400px] grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-white p-4 shadow-card">
                <dt className="text-[13px] font-semibold text-muted">{t("nextPayment")}</dt>
                <dd className="font-display text-[20px] font-extrabold text-cocoa">{formatDate(card.payment_due_date, { day: "numeric", month: "short" })}</dd>
                <dd className="text-[13px] font-bold text-brand">{t("inDays", { days: due })}</dd>
              </div>
              <div className="rounded-[20px] bg-white p-4 shadow-card">
                <dt className="text-[13px] font-semibold text-muted">{t("minimum")}</dt>
                <dd className="font-display text-[20px] font-extrabold text-cocoa">{formatMoney(card.minimum_payment, card.currency)}</dd>
                <dd className="text-[13px] text-muted">{t("full", { amount: formatMoney(card.current_balance, card.currency) })}</dd>
              </div>
            </dl>
            <div className="mt-5 max-w-[400px] rounded-[20px] bg-white p-4 shadow-card">
              <div className="mb-3 text-[14px] font-extrabold text-cocoa">{t("paymentHistory")}</div>
              <ol className="flex gap-2">
                {card.payment_history.map((h) => (
                  <li key={h.month} className="flex flex-1 flex-col items-center gap-1.5">
                    <span
                      className={cn("flex size-9 items-center justify-center rounded-full", h.status === "ON_TIME" ? "bg-success-soft text-success-ink" : h.status === "LATE" ? "bg-error-soft text-error-ink" : "bg-cream text-faint")}
                      title={h.status === "ON_TIME" ? t("history.onTime") : h.status === "LATE" ? t("history.late") : t("history.noStatement")}
                    >
                      {h.status === "ON_TIME" ? <Check className="size-4" strokeWidth={3} /> : <Circle className="size-3" />}
                      <span className="sr-only">{h.status === "ON_TIME" ? t("history.onTime") : h.status === "LATE" ? t("history.late") : t("history.noStatement")}</span>
                    </span>
                    <span className="text-[12px] font-semibold text-muted">{formatDate(h.month + "-01", { month: "short" })}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[12.5px] text-muted">{t("historyLegend")}</p>
            </div>
          </section>

          <div className="space-y-6">
            <MascotInsightCard
              headline={t("dueHeadline", { days: WORDS[due] ? t(`numberWords.${WORDS[due]}`) : due })}
              body={t("dueBody", { amount: formatMoney(card.current_balance, card.currency) })}
              actions={[{ href: "/copilot?q=Help%20me%20build%20credit", label: t("askCredit"), primary: true }]}
            />
            <ChecklistCard
              title={t("profileTitle", { study })}
              subtitle={<p className="text-[14px] text-muted">{t("profileSubtitle")}</p>}
              items={[
                { id: "acct", label: t("checklist.account"), detail: localAccount ? `${localAccount.name} •••• ${localAccount.account_last4}` : t("checklist.accountMissing"), state: localAccount ? "done" : "todo", stateLabel: localAccount ? t("checklist.done") : t("checklist.todo") },
                { id: "ontime", label: t("checklist.onTime"), detail: t("checklist.onTimeDetail", { count: onTime }), state: onTime > 0 && !late ? "done" : "todo", stateLabel: onTime > 0 && !late ? t("checklist.done") : t("checklist.todo") },
                { id: "util", label: t("checklist.utilisation"), detail: t("checklist.utilisationDetail", { percent: Math.round(utilisation * 100) }), state: utilisation < 0.3 ? "done" : "todo", stateLabel: utilisation < 0.3 ? t("checklist.done") : t("checklist.watch") },
                { id: "address", label: t("checklist.address"), detail: t("checklist.addressDetail"), state: "todo", stateLabel: t("checklist.suggested") },
              ]}
            />
            <p className="px-1 text-[13px] leading-5 text-muted">{t("disclaimer")}</p>
          </div>
        </div>
      )}

      <section>
        <SectionTitle title={t("openAccount")} />
        <BankSetupChecklist items={checklist} initialCountry={profile.study_country} />
      </section>
    </div>
  );
}
