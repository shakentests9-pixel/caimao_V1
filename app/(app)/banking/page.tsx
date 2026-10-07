import { Check, Circle } from "lucide-react";
import { getRepository } from "@/lib/session";
import { COUNTRY_NAMES } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { CreditCardVisual } from "@/components/caimao/credit-card-visual";
import { BankSetupChecklist } from "@/components/caimao/bank-setup";
import { ChecklistCard } from "@/components/caimao/checklist-card";
import { MascotInsightCard } from "@/components/caimao/mascot-insight-card";
import { cn, daysFromToday, formatDate } from "@/lib/utils";

export const metadata = { title: "Banking & Credit" };

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const SHORT: Record<string, string> = { GB: "UK", US: "US" };

export default async function BankingPage() {
  const repo = await getRepository();
  const [[card], checklist, profile, accounts] = await Promise.all([repo.listCreditCards(), repo.listChecklist(), repo.getProfile(), repo.listAccounts()]);
  const study = SHORT[profile.study_country] ?? COUNTRY_NAMES[profile.study_country];
  const utilisation = card ? card.current_balance / card.credit_limit : 0;
  const due = card ? daysFromToday(card.payment_due_date) : 0;
  const onTime = card?.payment_history.filter((h) => h.status === "ON_TIME").length ?? 0;
  const late = card?.payment_history.some((h) => h.status === "LATE") ?? false;
  const localAccount = accounts.find((a) => a.country === profile.study_country);

  return (
    <div className="space-y-10">
      <PageHeader title="Banking & Credit" description={`Build your ${study} financial profile while you study. Information only: CaiMao doesn't apply for anything on your behalf.`} />

      {card && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-8">
          <section>
            <CreditCardVisual card={card} />
            <dl className="mt-5 grid max-w-[400px] grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-white p-4 shadow-card">
                <dt className="text-[13px] font-semibold text-muted">Next payment</dt>
                <dd className="font-display text-[20px] font-extrabold text-cocoa">{formatDate(card.payment_due_date, { day: "numeric", month: "short" })}</dd>
                <dd className="text-[13px] font-bold text-brand">in {due} days</dd>
              </div>
              <div className="rounded-[20px] bg-white p-4 shadow-card">
                <dt className="text-[13px] font-semibold text-muted">Minimum</dt>
                <dd className="font-display text-[20px] font-extrabold text-cocoa">{formatMoney(card.minimum_payment, card.currency)}</dd>
                <dd className="text-[13px] text-muted">full: {formatMoney(card.current_balance, card.currency)}</dd>
              </div>
            </dl>
            <div className="mt-5 max-w-[400px] rounded-[20px] bg-white p-4 shadow-card">
              <div className="mb-3 text-[14px] font-extrabold text-cocoa">Payment history</div>
              <ol className="flex gap-2">
                {card.payment_history.map((h) => (
                  <li key={h.month} className="flex flex-1 flex-col items-center gap-1.5">
                    <span
                      className={cn("flex size-9 items-center justify-center rounded-full", h.status === "ON_TIME" ? "bg-success-soft text-success-ink" : h.status === "LATE" ? "bg-error-soft text-error-ink" : "bg-cream text-faint")}
                      title={h.status === "ON_TIME" ? "Paid on time" : h.status === "LATE" ? "Late" : "No statement"}
                    >
                      {h.status === "ON_TIME" ? <Check className="size-4" strokeWidth={3} /> : <Circle className="size-3" />}
                      <span className="sr-only">{h.status === "ON_TIME" ? "Paid on time" : h.status === "LATE" ? "Late" : "No statement"}</span>
                    </span>
                    <span className="text-[12px] font-semibold text-muted">{formatDate(h.month + "-01", { month: "short" })}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[12.5px] text-muted">Tick = paid on time · circle = no statement yet</p>
            </div>
          </section>

          <div className="space-y-6">
            <MascotInsightCard
              headline={`Your payment is due in ${WORDS[due] ?? due} days.`}
              body={`Paying on time helps maintain a positive payment history. Paying the full ${formatMoney(card.current_balance, card.currency)} rather than the minimum also avoids interest.`}
              actions={[{ href: "/copilot?q=Help%20me%20build%20credit", label: "Ask CaiMao about credit", primary: true }]}
            />
            <ChecklistCard
              title={`Build your ${study} financial profile`}
              subtitle={<p className="text-[14px] text-muted">Built from what CaiMao can see. Steps it can&apos;t see stay open.</p>}
              items={[
                { id: "acct", label: "Local bank account", detail: localAccount ? `${localAccount.name} •••• ${localAccount.account_last4}` : "Not linked yet", state: localAccount ? "done" : "todo", stateLabel: localAccount ? "Done" : "To do" },
                { id: "ontime", label: "Bills paid on time", detail: `${onTime} on-time card payments so far`, state: onTime > 0 && !late ? "done" : "todo", stateLabel: onTime > 0 && !late ? "Done" : "To do" },
                { id: "util", label: "Card balance managed", detail: `${Math.round(utilisation * 100)}% of your limit used`, state: utilisation < 0.3 ? "done" : "todo", stateLabel: utilisation < 0.3 ? "Done" : "Keep an eye on it" },
                { id: "address", label: "Register at your term-time address", detail: "Suggested step. CaiMao can't see this one.", state: "todo", stateLabel: "Suggested" },
              ]}
            />
            <p className="px-1 text-[13px] leading-5 text-muted">These habits are commonly recommended, but no one can promise a particular credit score or approval. General information, not financial advice.</p>
          </div>
        </div>
      )}

      <section>
        <SectionTitle title="Open a local bank account" />
        <BankSetupChecklist items={checklist} initialCountry={profile.study_country} />
      </section>
    </div>
  );
}
