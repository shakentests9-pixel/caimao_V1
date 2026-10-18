"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { CountryChip } from "@/components/country-chip";
import { StatusBadge } from "@/components/status-badge";
import { MascotTile } from "@/components/brand";
import { formatMoney } from "@/lib/fx/service";
import { SUPPORTED_COUNTRIES, type Currency, type SupportedCountry } from "@/lib/types";
import type { Journey, JourneyStep } from "@/lib/banking/journey";
import { cn } from "@/lib/utils";

/**
 * My Financial Setup: one personalised journey for moving to a study country.
 * Steps tick themselves when CaiMao can see the evidence; the rest the student ticks.
 */
export function SetupJourney({ journey }: { journey: Journey }) {
  const t = useTranslations("Setup");
  const tc = useTranslations("Countries");
  const tf = useTranslations("ProfileFields");
  const format = useFormatter();
  const router = useRouter();
  const [steps, setSteps] = useState(journey.steps);
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const country = journey.country;
  const countryName = tc(country);
  const done = steps.filter((s) => s.done).length;

  const toggle = (s: JourneyStep) =>
    start(async () => {
      const completed = !s.done;
      setSteps((list) => list.map((x) => (x.key === s.key ? { ...x, done: completed, done_by: completed ? "user" : null } : x)));
      await fetch("/api/setup", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ country, step: s.key, completed }) });
      router.refresh();
    });

  const refresh = () =>
    startRefresh(async () => {
      const res = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country }) });
      if (res.ok) setSteps((await res.json()).journey.steps);
      router.refresh();
    });

  const body = (s: JourneyStep) => {
    const d = s.data as Record<string, unknown>;
    switch (s.key) {
      case "documents": {
        const docs = (d.documents as string[]) ?? [];
        return (
          <>
            <p>{t("steps.documents.body")}</p>
            {docs.length ? <ul className="mt-2 list-disc space-y-0.5 pl-5">{docs.map((x) => <li key={x}>{x}</li>)}</ul> : null}
            <Link href="/settings#documents" className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold text-brand">{t("steps.documents.cta")} <ArrowRight className="size-3.5" /></Link>
          </>
        );
      }
      case "open_account": {
        const chosen = d.chosen as { name: string; account_type: string; url: string } | null;
        const account = d.account as { name: string; last4: string } | null;
        const likely = (d.likely as string[]) ?? [];
        const missing = (d.missing as string[]) ?? [];
        return (
          <>
            {account ? <p>{t("steps.open_account.have", { name: account.name, last4: account.last4 })}</p> : chosen ? <p>{t("steps.open_account.chosen", { bank: chosen.name, type: chosen.account_type })}</p> : <p>{t("steps.open_account.body")}</p>}
            {!account && missing.length ? <p className="mt-1 font-semibold text-cocoa">{t("steps.open_account.missing", { fields: missing.map((m) => tf(m)).join(", ") })}</p> : null}
            {!account && !chosen && likely.length ? <p className="mt-1">{t("steps.open_account.likely", { banks: likely.join(", ") })}</p> : null}
            <Link href={`/banking/abroad?country=${country}`} className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold text-brand">{t("steps.open_account.cta")} <ArrowRight className="size-3.5" /></Link>
          </>
        );
      }
      case "transfer_rules":
        return (
          <>
            <p className="flex flex-wrap items-center gap-2">
              {t("steps.transfer_rules.body", { from: tc(journey.home_country), to: countryName })} <StatusBadge status={journey.inbound.status} size="sm" />
            </p>
            <Link href="/transfers#rules" className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold text-brand">{t("steps.transfer_rules.cta")} <ArrowRight className="size-3.5" /></Link>
          </>
        );
      case "receive_funds": {
        const docs = (d.documents as string[]) ?? [];
        return (
          <>
            <p>{t("steps.receive_funds.body", { from: tc(journey.home_country) })}</p>
            {docs.length ? <ul className="mt-2 list-disc space-y-0.5 pl-5">{docs.map((x) => <li key={x}>{x}</li>)}</ul> : null}
          </>
        );
      }
      case "pay_tuition": {
        if (!d.title) return <p>{t("steps.pay_tuition.none")}</p>;
        return (
          <>
            <p>
              {d.status === "PAID"
                ? t("steps.pay_tuition.paid", { title: String(d.title) })
                : t("steps.pay_tuition.due", { title: String(d.title), amount: formatMoney(Number(d.amount), d.currency as Currency), date: format.dateTime(new Date(String(d.due_date) + "T12:00:00Z"), { day: "numeric", month: "long" }) })}
            </p>
            {d.status !== "PAID" ? <Link href="/copilot?q=Pay%20my%20tuition" className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold text-brand">{t("steps.pay_tuition.cta")} <ArrowRight className="size-3.5" /></Link> : null}
          </>
        );
      }
      case "recurring": {
        const items = (d.items as { title: string; amount: number; currency: Currency }[]) ?? [];
        return (
          <>
            <p>{t("steps.recurring.body")}</p>
            {items.length ? (
              <ul className="mt-2 space-y-1">
                {items.map((i) => (
                  <li key={i.title} className="flex justify-between gap-3 rounded-[10px] bg-white px-3 py-1.5">
                    <span>{i.title}</span>
                    <span className="num font-bold text-cocoa">{formatMoney(i.amount, i.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link href="/obligations" className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold text-brand">{t("steps.recurring.cta")} <ArrowRight className="size-3.5" /></Link>
          </>
        );
      }
      case "credit":
        return (
          <>
            <p>{d.has_bureau ? t("steps.credit.bureau", { bureaus: ((d.bureaus as string[]) ?? []).join(", ") }) : t("steps.credit.body")}</p>
            <Link href={`/banking/abroad?country=${country}#credit`} className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold text-brand">{t("steps.credit.cta")} <ArrowRight className="size-3.5" /></Link>
          </>
        );
      case "restrictions": {
        const rules = (d.rules as { id: string; name: string; regulator: string; url: string }[]) ?? [];
        return (
          <>
            <p>{t("steps.restrictions.body")}</p>
            {rules.length ? (
              <ul className="mt-2 space-y-1">
                {rules.slice(0, 6).map((r) => (
                  <li key={r.id} className="rounded-[10px] bg-white px-3 py-1.5">
                    <span className="font-semibold text-cocoa">{r.name}</span>{" "}
                    <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-brand hover:underline">
                      {r.regulator} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">{t("steps.restrictions.none")}</p>
            )}
          </>
        );
      }
      default:
        return <p>{t(`steps.${s.key}.body`)}</p>;
    }
  };

  return (
    <div className="space-y-6">
      <nav aria-label={t("countryNav")} className="cm-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SUPPORTED_COUNTRIES.map((c: SupportedCountry) => (
          <Link key={c} href={`/setup?country=${c}`} aria-current={c === country ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full pl-1.5 pr-4 text-[14px] font-bold", c === country ? "bg-cocoa text-white" : "bg-white text-cocoa-2 shadow-card hover:text-brand")}>
            <CountryChip code={c} size={30} /> {tc(c)}
          </Link>
        ))}
      </nav>

      <section className="cm-premium cm-ring relative isolate overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          <MascotTile size={56} />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-gold">{t("eyebrow")}</div>
            <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.04em] text-white">{t("headline", { country: countryName })}</h2>
            <p className="mt-1 text-[14.5px] text-cream">{t("route", { from: tc(journey.home_country), to: countryName })}</p>
          </div>
          <div className="text-right">
            <div className="num font-display text-[34px] font-extrabold text-gold">{done}/{steps.length}</div>
            <div className="text-[12.5px] text-cream">{t("stepsDone")}</div>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <button onClick={refresh} disabled={refreshing} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-white/10 px-4 text-[14px] font-bold text-white hover:bg-white/20">
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("refresh")}
        </button>
      </section>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className={cn("rounded-[22px] bg-white p-5 shadow-card", s.done && "bg-white/80")}>
            <div className="flex items-start gap-4">
              <span className={cn("num flex size-9 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-extrabold", s.done ? "bg-success-soft text-success-ink" : "bg-cream text-brand")}>
                {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[16px] font-extrabold text-cocoa">{t(`steps.${s.key}.title`)}</h3>
                  {s.done_by === "auto" ? (
                    <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-[12px] font-bold text-success-ink">{t("autoDone")}</span>
                  ) : (
                    <button onClick={() => toggle(s)} disabled={pending} aria-pressed={s.done} className={cn("min-h-9 rounded-[11px] px-3 text-[13px] font-bold", s.done ? "bg-success-soft text-success-ink" : "bg-cream text-cocoa hover:bg-sand")}>
                      {s.done ? t("done") : t("markDone")}
                    </button>
                  )}
                </div>
                <div className="mt-1.5 text-[14px] leading-6 text-cocoa-2">{body(s)}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-center text-[12.5px] text-muted">{t("disclaimer")}</p>
    </div>
  );
}
