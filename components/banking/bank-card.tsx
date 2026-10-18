"use client";
import { useFormatter, useTranslations } from "next-intl";
import { Check, ExternalLink, Minus, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { BankProduct } from "@/lib/types";
import type { BankEligibility } from "@/lib/banking/eligibility";
import { cn } from "@/lib/utils";

const VERDICT = { likely_eligible: "LIKELY_ELIGIBLE", check_with_bank: "CHECK_WITH_BANK", not_available: "NOT_AVAILABLE", need_info: "NEED_INFO" } as const;

/**
 * One bank's account offer, exactly as its own site states it. Unconfirmed facts are shown as
 * "Not confirmed", never filled in. The verdict appears only after the student runs the check.
 */
export function BankCard({ bank, eligibility, chosen, onChoose, busy }: { bank: BankProduct; eligibility?: BankEligibility; chosen?: boolean; onChoose?: () => void; busy?: boolean }) {
  const t = useTranslations("BankingAbroad");
  const tr = useTranslations("BankingAbroad.reasons");
  const format = useFormatter();
  const tri = (v: boolean | null) =>
    v === true ? (
      <span className="inline-flex items-center gap-1 font-bold text-success-ink"><Check className="size-3.5" aria-hidden />{t("yes")}</span>
    ) : v === false ? (
      <span className="inline-flex items-center gap-1 font-bold text-cocoa-2"><X className="size-3.5" aria-hidden />{t("no")}</span>
    ) : (
      <span className="inline-flex items-center gap-1 text-muted"><Minus className="size-3.5" aria-hidden />{t("notConfirmed")}</span>
    );
  const text = (v: string | number | null) => (v == null || v === "" ? <span className="text-muted">{t("notConfirmed")}</span> : <span className="text-cocoa">{v}</span>);

  return (
    <article className={cn("flex flex-col rounded-[24px] border-2 bg-white p-5 shadow-card", chosen ? "border-brand" : "border-transparent")}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[18px] font-extrabold leading-tight text-cocoa">{bank.bank_name}</h3>
          <p className="mt-0.5 text-[13.5px] text-cocoa-2">{bank.account_type}</p>
        </div>
        {eligibility ? <StatusBadge status={VERDICT[eligibility.verdict]} size="sm" /> : bank.status !== "verified" ? <StatusBadge status="NEEDS_VERIFICATION" size="sm" /> : null}
      </header>

      {eligibility?.reasons.length ? (
        <ul className="mt-3 space-y-1 rounded-[14px] bg-cream px-3.5 py-2.5 text-[13px] text-cocoa-2">
          {eligibility.reasons.map((r, i) => (
            <li key={i}>{tr.has(r.code) ? tr(r.code, (r.params ?? {}) as Record<string, string | number>) : r.code}</li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-muted">{t("studentAccount")}</dt>
        <dd>{tri(bank.student_account_available)}</dd>
        <dt className="text-muted">{t("intlStudents")}</dt>
        <dd>{tri(bank.international_student_eligible)}</dd>
        <dt className="text-muted">{t("residentRequired")}</dt>
        <dd>{tri(bank.resident_required)}</dd>
        <dt className="text-muted">{t("minimumAge")}</dt>
        <dd>{text(bank.minimum_age)}</dd>
        <dt className="text-muted">{t("monthlyFee")}</dt>
        <dd className="min-w-0 break-words">{text(bank.monthly_fee)}</dd>
        <dt className="text-muted">{t("minimumBalance")}</dt>
        <dd className="min-w-0 break-words">{text(bank.minimum_balance)}</dd>
        <dt className="text-muted">{t("intlTransfers")}</dt>
        <dd>{tri(bank.international_transfer_support)}</dd>
      </dl>

      <details className="group mt-3 text-[13px]">
        <summary className="min-h-10 cursor-pointer list-none py-2 font-bold text-brand">{t("moreDetails")}</summary>
        <div className="space-y-2 pb-1 text-cocoa-2">
          {bank.visa_requirements ? <p><span className="font-bold text-cocoa">{t("visa")}:</span> {bank.visa_requirements}</p> : null}
          {bank.documents.length ? (
            <div>
              <span className="font-bold text-cocoa">{t("documents")}:</span>
              <ul className="ml-4 mt-1 list-disc space-y-0.5">{bank.documents.map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
          ) : null}
          {bank.credit_card_available ? <p><span className="font-bold text-cocoa">{t("creditCard")}:</span> {bank.credit_card_available}</p> : null}
          {bank.notes ? <p><span className="font-bold text-cocoa">{t("notes")}:</span> {bank.notes}</p> : null}
          {bank.evidence_quote ? <blockquote className="border-l-2 border-brand-line pl-3 italic text-muted">“{bank.evidence_quote}”</blockquote> : null}
        </div>
      </details>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <a href={bank.official_url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 items-center gap-1 text-[13px] font-bold text-brand hover:underline">
          {t("officialSite")} <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <span className="text-[12px] text-muted">{t("lastVerified", { date: format.dateTime(new Date(bank.last_verified + "T12:00:00Z"), { day: "numeric", month: "short", year: "numeric" }) })}</span>
        {onChoose ? (
          <button
            onClick={onChoose}
            disabled={busy}
            aria-pressed={chosen}
            className={cn("min-h-10 w-full rounded-[12px] text-[13.5px] font-extrabold", chosen ? "bg-brand text-white" : "bg-cream text-cocoa hover:bg-sand")}
          >
            {chosen ? t("chosen") : t("choose")}
          </button>
        ) : null}
      </footer>
    </article>
  );
}
