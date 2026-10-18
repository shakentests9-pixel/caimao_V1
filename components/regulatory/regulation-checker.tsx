"use client";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";
import { COUNTRY_CODES, COUNTRY_CURRENCY, CURRENCIES, RESIDENCY_STATUSES, VISA_TYPES, type CountryCode, type Currency, type ResidencyStatus, type VisaType } from "@/lib/types";
import type { RegulatoryResult } from "@/lib/regulatory/engine";
import { RegulatoryResultCard } from "./regulatory-result";

export interface CheckerDefaults {
  source_country: CountryCode;
  destination_country: CountryCode;
  nationality: CountryCode | null;
  residency_status: ResidencyStatus | null;
  visa_type: VisaType | null;
}

/**
 * Cross-border regulation check: corridor, purpose, amount and the person's situation.
 * Results come from the structured rule database via /api/regulation/check.
 */
export function RegulationChecker({ defaults, initialResult }: { defaults: CheckerDefaults; initialResult?: RegulatoryResult | null }) {
  const t = useTranslations("Regulation");
  const tc = useTranslations("Countries");
  const tp = useTranslations("ProfileForm");
  const [from, setFrom] = useState<CountryCode>(defaults.source_country);
  const [to, setTo] = useState<CountryCode>(defaults.destination_country);
  const [purpose, setPurpose] = useState<"education" | "personal">("education");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(COUNTRY_CURRENCY[defaults.destination_country]);
  const [nationality, setNationality] = useState<CountryCode | null>(defaults.nationality);
  const [residency, setResidency] = useState<ResidencyStatus | null>(defaults.residency_status);
  const [visa, setVisa] = useState<VisaType | null>(defaults.visa_type);
  const [result, setResult] = useState<RegulatoryResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const details = useRef<HTMLDetailsElement>(null);

  const run = () =>
    start(async () => {
      setError(null);
      const n = Number(amount.replace(/,/g, ""));
      const res = await fetch("/api/regulation/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_country: from,
          destination_country: to,
          purpose,
          amount: n > 0 ? n : null,
          currency: n > 0 ? currency : null,
          nationality,
          residency_status: residency,
          visa_type: visa,
          use_profile: true,
        }),
      });
      if (!res.ok) return setError(t("error"));
      setResult((await res.json()).result);
    });

  const field = "h-12 w-full rounded-[14px] border border-line bg-white px-3 text-[15px] font-semibold text-cocoa outline-none focus:border-brand";
  const label = "mb-1.5 block text-[13px] font-bold text-cocoa-2";

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="rounded-[24px] bg-white p-5 shadow-card sm:p-6"
        aria-label={t("formLabel")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className={label}>{t("from")}</span>
            <select className={field} value={from} onChange={(e) => setFrom(e.target.value as CountryCode)}>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>{tc(c)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>{t("to")}</span>
            <select
              className={field}
              value={to}
              onChange={(e) => {
                const v = e.target.value as CountryCode;
                setTo(v);
                setCurrency(COUNTRY_CURRENCY[v]);
              }}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>{tc(c)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>{t("purposeLabel")}</span>
            <select className={field} value={purpose} onChange={(e) => setPurpose(e.target.value as "education" | "personal")}>
              <option value="education">{t("purpose.education")}</option>
              <option value="personal">{t("purpose.personal")}</option>
            </select>
          </label>
          <div>
            <span className={label} id="amt-label">{t("amount")}</span>
            <div className="flex gap-2">
              <input aria-labelledby="amt-label" inputMode="decimal" placeholder={t("amountOptional")} className={field} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
              <select aria-label={t("currency")} className={`${field} w-[96px]`} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <details ref={details} className="group mt-4 rounded-[18px] bg-cream p-4" open={!defaults.nationality || !defaults.visa_type || !defaults.residency_status}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-[14px] font-bold text-cocoa">
            {t("aboutYou")}
            <span className="text-[12.5px] font-semibold text-muted">
              {nationality ? tc(nationality) : tp("notSet")} · {visa ? tp(`visaTypes.${visa}`) : tp("notSet")}
            </span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label>
              <span className={label}>{tp("nationality")}</span>
              <select className={field} value={nationality ?? ""} onChange={(e) => setNationality((e.target.value || null) as CountryCode | null)}>
                <option value="">{tp("notSet")}</option>
                {COUNTRY_CODES.map((c) => (
                  <option key={c} value={c}>{tc(c)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className={label}>{tp("residency")}</span>
              <select className={field} value={residency ?? ""} onChange={(e) => setResidency((e.target.value || null) as ResidencyStatus | null)}>
                <option value="">{tp("notSet")}</option>
                {RESIDENCY_STATUSES.map((r) => (
                  <option key={r} value={r}>{tp(`residencies.${r}`)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className={label}>{tp("visaType")}</span>
              <select className={field} value={visa ?? ""} onChange={(e) => setVisa((e.target.value || null) as VisaType | null)}>
                <option value="">{tp("notSet")}</option>
                {VISA_TYPES.map((v) => (
                  <option key={v} value={v}>{tp(`visaTypes.${v}`)}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-[12.5px] text-muted">{t("aboutYouHint")}</p>
        </details>

        <button type="submit" disabled={pending || from === to} className="cm-press cm-cta mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] text-[16px] font-extrabold disabled:opacity-50 sm:w-auto sm:px-8">
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />} {t("check")}
        </button>
        {from === to ? <p className="mt-2 text-[13px] text-muted">{t("sameCountry")}</p> : null}
        {error ? <p role="alert" className="mt-2 text-[14px] font-semibold text-error-ink">{error}</p> : null}
      </form>

      <div aria-live="polite">
        {result ? (
          <RegulatoryResultCard
            result={result}
            onProvide={() => {
              if (details.current) {
                details.current.open = true;
                details.current.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
