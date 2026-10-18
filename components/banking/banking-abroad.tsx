"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, ExternalLink, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { CountryChip } from "@/components/country-chip";
import { CrossBorderProfileForm } from "@/components/cross-border-profile-form";
import { BankCard } from "./bank-card";
import { CreditEducation } from "./credit-education";
import { cn } from "@/lib/utils";
import type { AccountRequirements, BankProduct, CreditSystemInfo, Profile, SupportedCountry } from "@/lib/types";
import { SUPPORTED_COUNTRIES } from "@/lib/types";
import type { EligibilityResult } from "@/lib/banking/eligibility";

export interface BankingAbroadProps {
  country: SupportedCountry;
  profile: Pick<Profile, "nationality" | "home_country" | "study_country" | "age" | "student_status" | "visa_type" | "residency_status" | "tax_residency">;
  missing: string[];
  banks: BankProduct[];
  requirements: AccountRequirements | null;
  credit: CreditSystemInfo | null;
  chosenBankId: string | null;
}

const STEP_COUNT = 8;

export function BankingAbroad(props: BankingAbroadProps) {
  const t = useTranslations("BankingAbroad");
  const tc = useTranslations("Countries");
  const tp = useTranslations("ProfileForm");
  const tf = useTranslations("ProfileFields");
  const router = useRouter();
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [chosen, setChosen] = useState(props.chosenBankId);
  const [editing, setEditing] = useState(props.missing.length > 0);
  const [pending, start] = useTransition();
  const [planning, startPlan] = useTransition();
  const { country, profile } = props;
  const countryName = tc(country);

  const check = () =>
    start(async () => {
      const res = await fetch("/api/banking/guidance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country }) });
      if (res.ok) setResult((await res.json()).eligibility);
    });

  const choose = (id: string) =>
    start(async () => {
      const next = chosen === id ? null : id;
      setChosen(next);
      await fetch("/api/setup", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ country, bank_id: next }) });
    });

  const createPlan = () =>
    startPlan(async () => {
      const res = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country }) });
      if (res.ok) router.push(`/setup?country=${country}`);
    });

  const byBank = new Map(result?.banks.map((b) => [b.bank.id, b]) ?? []);
  const banks = result ? result.banks.map((b) => b.bank) : props.banks;
  const missing = result?.missing ?? props.missing;

  return (
    <div className="space-y-6">
      {/* Country switch */}
      <nav aria-label={t("countryNav")} className="cm-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SUPPORTED_COUNTRIES.map((c) => (
          <Link
            key={c}
            href={`/banking/abroad?country=${c}`}
            aria-current={c === country ? "page" : undefined}
            className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full pl-1.5 pr-4 text-[14px] font-bold", c === country ? "bg-cocoa text-white" : "bg-white text-cocoa-2 shadow-card hover:text-brand")}
          >
            <CountryChip code={c} size={30} /> {tc(c)}
          </Link>
        ))}
      </nav>

      {/* About you */}
      <section className="rounded-[24px] bg-white p-5 shadow-card sm:p-6" aria-labelledby="you-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="you-title" className="flex items-center gap-2 font-display text-[20px] font-extrabold text-cocoa"><UserRound className="size-5 text-brand" aria-hidden /> {t("aboutYou")}</h2>
            <p className="mt-0.5 text-[14px] text-muted">{t("aboutYouHint")}</p>
          </div>
          <button onClick={() => setEditing((v) => !v)} className="min-h-10 rounded-[12px] bg-cream px-4 text-[13.5px] font-bold text-cocoa hover:bg-sand">
            {editing ? t("doneEditing") : t("edit")}
          </button>
        </div>
        {!editing ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[14px] sm:grid-cols-4">
            {[
              [tp("nationality"), profile.nationality ? tc(profile.nationality) : null],
              [tp("currentCountry"), tc(profile.home_country)],
              [t("destination"), countryName],
              [tp("age"), profile.age],
              [tp("studentStatus"), profile.student_status ? tp(`studentStatuses.${profile.student_status}`) : null],
              [tp("visaType"), profile.visa_type ? tp(`visaTypes.${profile.visa_type}`) : null],
              [tp("residency"), profile.residency_status ? tp(`residencies.${profile.residency_status}`) : null],
              [tp("taxResidency"), profile.tax_residency ? tc(profile.tax_residency) : null],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[12.5px] text-muted">{k}</dt>
                <dd className={cn("font-bold", v == null ? "text-warning-ink" : "text-cocoa")}>{v ?? tp("notSet")}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="mt-4">
            <CrossBorderProfileForm initial={{ ...profile, study_country: profile.study_country }} compact onSaved={() => { setEditing(false); setResult(null); }} />
          </div>
        )}
        {missing.length ? (
          <p role="status" className="mt-4 rounded-[14px] bg-[#EFE3D9] px-4 py-3 text-[14px] font-semibold text-cocoa">
            {t("askFirst", { fields: missing.map((m) => tf(m)).join(", ") })}
          </p>
        ) : null}
      </section>

      {/* How to open an account */}
      <section aria-labelledby="steps-title" className="rounded-[24px] bg-white p-5 shadow-card sm:p-6">
        <h2 id="steps-title" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("howTitle", { country: countryName })}</h2>
        {props.requirements ? <p className="mt-1 max-w-[75ch] text-[14.5px] leading-6 text-muted">{props.requirements.summary}</p> : null}
        <ol className="mt-5 grid gap-3 md:grid-cols-2">
          {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((n) => (
            <li key={n} className="flex gap-3 rounded-[18px] bg-cream p-4">
              <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-white font-display text-[14px] font-extrabold text-brand">{n}</span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-extrabold text-cocoa">{t(`steps.${n}.title`)}</h3>
                <p className="mt-0.5 text-[13.5px] leading-5 text-cocoa-2">{t(`steps.${n}.body`)}</p>
                {n === 1 && props.requirements?.eligibility_factors.length ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[13px] text-cocoa-2">{props.requirements.eligibility_factors.map((x) => <li key={x}>{x}</li>)}</ul>
                ) : null}
                {n === 2 && props.requirements?.typical_documents.length ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[13px] text-cocoa-2">{props.requirements.typical_documents.map((x) => <li key={x}>{x}</li>)}</ul>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {props.requirements ? (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
            <span>{t("sourcesLabel")}</span>
            {props.requirements.sources.slice(0, 5).map((s) => (
              <a key={s} href={s} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
                {new URL(s).hostname.replace(/^www\./, "")} <ExternalLink className="size-3" aria-hidden />
              </a>
            ))}
          </div>
        ) : null}
      </section>

      {/* Banks */}
      <section aria-labelledby="banks-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h2 id="banks-title" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("banksTitle", { country: countryName })}</h2>
            <p className="max-w-[70ch] text-[14px] text-muted">{t("banksHint")}</p>
          </div>
          <button onClick={check} disabled={pending} className="cm-press cm-cta inline-flex h-12 items-center gap-2 rounded-[16px] px-5 text-[15px] font-extrabold disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {result ? t("recheck") : t("checkEligibility")}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {banks.map((b) => (
            <BankCard key={b.id} bank={b} eligibility={byBank.get(b.id)} chosen={chosen === b.id} onChoose={() => choose(b.id)} busy={pending} />
          ))}
        </div>
        <p className="mt-3 px-1 text-[12.5px] leading-5 text-muted">{t("bankDecides")}</p>
      </section>

      {props.credit ? <CreditEducation info={props.credit} countryName={countryName} /> : null}

      {/* Plan */}
      <section className="cm-insight flex flex-col items-start gap-4 rounded-[24px] p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex-1">
          <h2 className="font-display text-[20px] font-extrabold text-cocoa">{t("planTitle", { country: countryName })}</h2>
          <p className="mt-1 text-[14.5px] text-muted">{t("planBody")}</p>
        </div>
        <button onClick={createPlan} disabled={planning} className="cm-press cm-cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] px-6 text-[15px] font-extrabold disabled:opacity-60 sm:w-auto">
          {planning ? <Loader2 className="size-4 animate-spin" /> : null} {t("createPlan")} <ArrowRight className="size-4" />
        </button>
      </section>
    </div>
  );
}
