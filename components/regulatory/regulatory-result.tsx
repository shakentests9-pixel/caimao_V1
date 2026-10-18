"use client";
import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, ExternalLink, FileCheck2, Gauge, Info, Landmark, ListChecks, Quote } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/lib/fx/service";
import type { CountryRule, Currency, Locale } from "@/lib/types";
import type { Finding, RegulatoryResult } from "@/lib/regulatory/engine";
import { cn } from "@/lib/utils";

/** Rule name/summary in the user's language when a reviewed translation exists; otherwise the English text. */
export function useRuleText() {
  const locale = useLocale() as Locale;
  return (r: CountryRule) => {
    const tr = locale !== "en" ? r.i18n?.[locale] : null;
    return { name: tr?.name ?? r.rule_name, summary: tr?.summary ?? r.rule_description, translated: !!tr || locale === "en" };
  };
}

const STATUS_TONE: Record<RegulatoryResult["status"], string> = {
  COMPLIANT: "border-success/40 bg-success-soft/40",
  ACTION_REQUIRED: "border-warning/50 bg-warning-soft/60",
  BLOCKED: "border-error/40 bg-error-soft/60",
  NEEDS_VERIFICATION: "border-sand bg-cream",
};

/**
 * One regulatory answer in the format required for every rule response:
 * status → what this means → requirements → documents → limits → important considerations → official source → last verified.
 */
export function RegulatoryResultCard({ result, compact, onProvide }: { result: RegulatoryResult; compact?: boolean; onProvide?: () => void }) {
  const t = useTranslations("Regulation");
  const tc = useTranslations("Countries");
  const tf = useTranslations("ProfileFields");
  const format = useFormatter();
  const ruleText = useRuleText();
  const [showAll, setShowAll] = useState(false);
  const q = result.query;
  const from = tc(q.source_country);
  const to = tc(q.destination_country);

  const money = (amount: number, ccy: string) => (ccy ? formatMoney(amount, ccy as Currency) : String(amount));
  const findingText = (f: Finding) => {
    const p = f.message.params;
    const limit = money(Number(p.limit ?? 0), String(p.currency ?? ""));
    const amount = money(Number(p.amount ?? 0), String(p.currency ?? ""));
    switch (f.message.code) {
      case "within_limit":
        return t("finding.within_limit", { limit, amount });
      case "over_limit":
        return t("finding.over_limit", { limit, amount });
      case "below_threshold":
        return t("finding.below_threshold", { limit, amount });
      case "documents_needed":
        return t("finding.documents_needed", { docs: f.documents.filter((d) => !d.on_file).map((d) => d.name).join(", ") });
      case "documents_ready":
        return t("finding.documents_ready");
      case "report_over_threshold":
        return t("finding.report_over_threshold", { limit });
      case "report_below_threshold":
        return t("finding.report_below_threshold", { limit });
      case "cash_guidance":
        return t("finding.cash_guidance", { limit });
      case "unverified_rule":
        return t("finding.unverified_rule");
      case "depends_on":
        return t("finding.depends_on", { fields: String(p.fields).split(",").map((k) => tf(k)).join(", ") });
      default:
        return ruleText(f.rule).summary;
    }
  };

  const requirements = result.findings.filter((f) => ["DOCUMENTS", "BLOCK", "REPORT", "CONDITIONAL"].includes(f.outcome) || (f.outcome === "UNVERIFIED" && f.rule.enforcement !== "info"));
  const passes = result.findings.filter((f) => f.outcome === "PASS");
  const limits = result.findings.filter((f) => (f.rule.limit_amount ?? f.rule.maximum_amount) != null && f.rule.currency && f.rule.channel !== "cash");
  const considerations = result.findings.filter((f) => f.outcome === "INFO" || f.rule.channel === "cash" || (f.outcome === "UNVERIFIED" && f.rule.enforcement === "info"));
  const shownConsiderations = showAll ? considerations : considerations.slice(0, compact ? 3 : 5);

  return (
    <article className={cn("rounded-[24px] border-2 p-5 sm:p-6", STATUS_TONE[result.status])} aria-label={t("resultLabel", { from, to })}>
      {/* STATUS */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">{t("statusLabel")}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={result.status} />
            <span className="text-[14px] font-bold text-cocoa">
              {from} → {to} · {t(`purpose.${q.purpose}`)}
              {q.amount && q.currency ? ` · ${formatMoney(q.amount, q.currency)}` : ""}
            </span>
          </div>
        </div>
        <span className="text-[12.5px] text-muted">{t("checkedAt", { time: format.dateTime(new Date(result.checked_at), { hour: "2-digit", minute: "2-digit" }) })}</span>
      </header>

      {/* What this means */}
      <Section icon={<Info className="size-4" />} title={t("whatThisMeans")}>
        <p className="text-[15px] leading-6 text-cocoa">
          {result.unverified_message ? t("unverified") : t(`meaning.${result.status}`, { from, to })}
        </p>
        {result.missing_info.length ? (
          <div className="mt-3 rounded-[16px] bg-white p-3.5">
            <p className="text-[14px] font-bold text-cocoa">{t("needDetails")}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {result.missing_info.map((m) => (
                <li key={m} className="rounded-full bg-cream px-2.5 py-1 text-[12.5px] font-bold text-cocoa-2">
                  {tf(m)}
                </li>
              ))}
            </ul>
            {onProvide ? (
              <button onClick={onProvide} className="mt-3 min-h-10 rounded-[12px] bg-cocoa px-4 text-[13.5px] font-bold text-white">
                {t("provideDetails")}
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="mt-2 text-[12.5px] text-muted">
          {t("coverage", {
            fromCountry: from,
            fromCount: result.coverage[0]?.verified_rules ?? 0,
            toCountry: to,
            toCount: result.coverage[1]?.verified_rules ?? 0,
          })}
        </p>
      </Section>

      {/* Requirements */}
      {requirements.length || passes.length ? (
        <Section icon={<ListChecks className="size-4" />} title={t("requirements")}>
          <ul className="space-y-2">
            {[...requirements, ...passes.filter((p) => p.rule.enforcement !== "info")].map((f) => (
              <li key={f.rule.id} className="flex gap-2.5 rounded-[14px] bg-white px-3.5 py-2.5">
                {f.outcome === "PASS" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden /> : <CircleDashed className={cn("mt-0.5 size-4 shrink-0", f.outcome === "BLOCK" ? "text-error-ink" : "text-warning-ink")} aria-hidden />}
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-cocoa">{ruleText(f.rule).name}</span>
                  <span className="block text-[13.5px] text-cocoa-2">{findingText(f)}</span>
                  <span className="block text-[12px] text-muted">{t(`side.${f.side}`, { country: f.side === "receiving" ? to : from })}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Documents */}
      {result.documents.length ? (
        <Section icon={<FileCheck2 className="size-4" />} title={t("documents")}>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {result.documents.map((d) => (
              <li key={d.name} className="flex items-center gap-2 rounded-[12px] bg-white px-3 py-2 text-[13.5px]">
                {d.on_file ? <CheckCircle2 className="size-4 shrink-0 text-success-ink" aria-hidden /> : <CircleDashed className="size-4 shrink-0 text-warning-ink" aria-hidden />}
                <span className="flex-1 font-semibold text-cocoa">{d.name}</span>
                <span className={cn("text-[12px] font-bold", d.on_file ? "text-success-ink" : "text-warning-ink")}>{d.on_file ? t("onFile") : t("prepare")}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Limits */}
      {limits.length ? (
        <Section icon={<Gauge className="size-4" />} title={t("limits")}>
          <ul className="space-y-1.5">
            {limits.map((f) => (
              <li key={f.rule.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-[12px] bg-white px-3.5 py-2.5">
                <span className="text-[13.5px] font-semibold text-cocoa">{ruleText(f.rule).name}</span>
                <span className="num text-[13.5px] font-extrabold text-cocoa">{formatMoney(Number(f.rule.limit_amount ?? f.rule.maximum_amount), f.rule.currency!)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Important considerations */}
      {considerations.length ? (
        <Section icon={<Landmark className="size-4" />} title={t("considerations")}>
          <ul className="space-y-2">
            {shownConsiderations.map((f) => {
              const text = ruleText(f.rule);
              return (
                <li key={f.rule.id} className="rounded-[14px] bg-white px-3.5 py-2.5">
                  <span className="block text-[14px] font-bold text-cocoa">
                    {text.name}
                    {f.rule.channel === "cash" ? <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-muted">{t("cashOnly")}</span> : null}
                    {f.rule.status === "needs_verification" ? <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-muted">{t("notVerified")}</span> : null}
                  </span>
                  <span className="block text-[13.5px] leading-5 text-cocoa-2">{text.summary}</span>
                  {f.rule.applies_to ? <span className="mt-0.5 block text-[12px] text-muted">{t("appliesTo", { who: f.rule.applies_to })}</span> : null}
                </li>
              );
            })}
          </ul>
          {considerations.length > shownConsiderations.length || showAll ? (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 min-h-10 text-[13.5px] font-bold text-brand">
              {showAll ? t("showFewer") : t("showAll", { count: considerations.length })}
            </button>
          ) : null}
        </Section>
      ) : null}

      {/* Official source + last verified */}
      <Section icon={<Quote className="size-4" />} title={t("sources")}>
        {result.sources.length ? (
          <ul className="space-y-1.5">
            {result.sources.slice(0, compact ? 4 : 20).map((s) => (
              <li key={s.url} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] bg-white px-3.5 py-2.5 text-[13.5px]">
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-w-0 items-center gap-1 font-bold text-brand hover:underline">
                  <span className="truncate">{s.regulator}</span> <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                </a>
                <span className="text-[12.5px] text-muted">{t("lastVerified", { date: format.dateTime(new Date(s.last_verified + "T12:00:00Z"), { day: "numeric", month: "short", year: "numeric" }) })}</span>
                <StatusBadge size="sm" status={s.status === "verified" ? "VERIFIED" : "NEEDS_VERIFICATION"} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted">{t("noSources")}</p>
        )}
        <p className="mt-2 text-[12px] leading-5 text-muted">{t("disclaimer")}</p>
      </Section>
    </article>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-cocoa-2">
        <span className="text-brand">{icon}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}
