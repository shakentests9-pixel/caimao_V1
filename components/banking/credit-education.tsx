"use client";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, ExternalLink, HeartHandshake, Lightbulb, Scale } from "lucide-react";
import type { CreditSystemInfo } from "@/lib/types";

/**
 * Credit history education for one country, from the researched credit_system_rules.
 * Wording stays conditional ("may", "can contribute"): CaiMao never promises a score, an approval or a rate.
 */
export function CreditEducation({ info, countryName }: { info: CreditSystemInfo; countryName: string }) {
  const t = useTranslations("CreditEducation");
  const format = useFormatter();
  const list = (items: string[]) => (
    <ul className="space-y-1.5">
      {items.map((x) => (
        <li key={x} className="flex gap-2 text-[14px] leading-5 text-cocoa-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section id="credit" aria-labelledby="credit-title" className="scroll-mt-24 rounded-[24px] bg-white p-5 shadow-card sm:p-6">
      <h2 id="credit-title" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("title", { country: countryName })}</h2>
      <p className="mt-1 text-[15px] text-muted">
        {info.has_formal_bureau === true
          ? t("hasBureau", { bureaus: info.bureaus.join(", ") || "—" })
          : info.has_formal_bureau === false
            ? t("noBureau")
            : t("bureauUnknown")}
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {info.what_contributes.length ? (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[15px] font-extrabold text-cocoa"><Scale className="size-4 text-brand" aria-hidden /> {t("contributes")}</h3>
            {list(info.what_contributes)}
          </div>
        ) : null}
        {info.why_it_matters.length ? (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[15px] font-extrabold text-cocoa"><Lightbulb className="size-4 text-brand" aria-hidden /> {t("whyMatters")}</h3>
            {list(info.why_it_matters)}
          </div>
        ) : null}
        {info.responsible_behaviours.length ? (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[15px] font-extrabold text-cocoa"><HeartHandshake className="size-4 text-success-ink" aria-hidden /> {t("habits")}</h3>
            {list(info.responsible_behaviours)}
          </div>
        ) : null}
        {info.risks.length ? (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[15px] font-extrabold text-cocoa"><AlertTriangle className="size-4 text-warning-ink" aria-hidden /> {t("risks")}</h3>
            {list(info.risks)}
          </div>
        ) : null}
      </div>

      {info.foreigner_notes ? (
        <p className="mt-5 rounded-[16px] bg-cream px-4 py-3 text-[14px] leading-6 text-cocoa-2">
          <span className="font-bold text-cocoa">{t("newcomers")}</span> {info.foreigner_notes}
        </p>
      ) : null}

      <p className="mt-4 text-[13px] font-semibold text-cocoa-2">{t("noGuarantee")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>{t("lastVerified", { date: format.dateTime(new Date(info.last_verified + "T12:00:00Z"), { day: "numeric", month: "short", year: "numeric" }) })}</span>
        {info.sources.slice(0, 4).map((s) => (
          <a key={s} href={s} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
            {new URL(s).hostname.replace(/^www\./, "")} <ExternalLink className="size-3" aria-hidden />
          </a>
        ))}
      </div>
    </section>
  );
}
