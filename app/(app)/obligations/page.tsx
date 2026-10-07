import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { getRepository } from "@/lib/session";
import type { Obligation } from "@/lib/types";
import { COUNTRY_NAMES } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { CountryChip } from "@/components/country-chip";
import { EmptyState } from "@/components/caimao/empty-state";
import { cn, daysFromToday, dueText, formatDate } from "@/lib/utils";

export const metadata = { title: "Bills & obligations" };

type View = "upcoming" | "paid" | "all";

function urgency(o: Obligation) {
  if (o.status === "PAID") return { label: "Paid", cls: "text-success-ink" };
  const d = daysFromToday(o.due_date);
  if (d <= 7) return { label: `Due soon · ${dueText(d).toLowerCase()}`, cls: "text-brand" };
  return { label: dueText(d), cls: "text-muted" };
}

export default async function ObligationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const repo = await getRepository();
  const { view: v } = await searchParams;
  const view: View = v === "paid" || v === "all" ? v : "upcoming";
  const [obligations, profile, executions] = await Promise.all([repo.listObligations(), repo.getProfile(), repo.listExecutions()]);
  const list = obligations.filter((o) => (view === "all" ? true : view === "paid" ? o.status === "PAID" : o.status !== "PAID"));
  const tuition = obligations.find((o) => o.kind === "tuition");
  const exec = tuition?.payment_execution_id ? executions.find((e) => e.id === tuition.payment_execution_id) : null;

  // Group into months for a calendar feel.
  const groups = new Map<string, Obligation[]>();
  for (const o of list) {
    const key = (o.status === "PAID" && o.paid_at ? o.paid_at : o.due_date).slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const counts = { upcoming: obligations.filter((o) => o.status !== "PAID").length, paid: obligations.filter((o) => o.status === "PAID").length, all: obligations.length };

  return (
    <div className="space-y-8">
      <PageHeader title="Bills & obligations" description="Everything you owe, in date order, and how each one was settled." />

      {tuition && (
        <section className={cn("relative overflow-hidden rounded-[28px] p-6 shadow-card sm:p-8", tuition.status === "PAID" ? "bg-white" : "cm-insight")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <CountryChip code={tuition.destination_country} size={52} />
              <div>
                <div className="text-[14px] text-muted">Tuition · {profile.university}</div>
                <div className="font-display text-[22px] font-extrabold text-cocoa">{tuition.payee}</div>
              </div>
            </div>
            <StatusBadge status={tuition.status} />
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <Money amount={tuition.amount} currency={tuition.currency} className="font-display text-[40px] font-extrabold leading-none text-cocoa sm:text-[48px]" />
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[14.5px]">
                <div><dt className="text-muted">Invoice</dt><dd className="font-mono text-[14px] text-cocoa">{tuition.invoice_ref}</dd></div>
                <div><dt className="text-muted">Due</dt><dd className="text-cocoa">{formatDate(tuition.due_date)}</dd></div>
                <div><dt className="text-muted">Purpose</dt><dd className="text-cocoa">{tuition.purpose}</dd></div>
                <div><dt className="text-muted">Country</dt><dd className="text-cocoa">{COUNTRY_NAMES[tuition.destination_country]}</dd></div>
              </dl>
            </div>
            {tuition.status === "PAID" ? (
              <div className="text-right text-[14.5px] text-cocoa-2">
                <div className="flex items-center justify-end gap-1.5 font-medium text-success-ink"><Check className="size-4" strokeWidth={3} /> Paid {tuition.paid_at ? formatDate(tuition.paid_at) : ""}</div>
                {exec ? <div className="text-muted">via {exec.provider} · <span className="font-mono">{exec.transaction_id}</span></div> : null}
                <Link href="/evidence" className="mt-2 inline-flex min-h-11 items-center gap-1 font-medium text-brand hover:underline">View receipt <ArrowRight className="size-4" /></Link>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="font-display text-[18px] font-extrabold text-brand">{dueText(daysFromToday(tuition.due_date))}</span>
                <Link href="/copilot?q=Pay%20my%20tuition" className="cm-press cm-cta inline-flex h-[54px] items-center gap-2 rounded-[16px] px-6 text-[16px] font-extrabold">
                  Pay with CaiMao <ArrowRight className="size-[18px]" />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex gap-1 rounded-[16px] bg-[#F3E6DB] p-1 sm:inline-flex" role="tablist" aria-label="Filter obligations">
        {(["upcoming", "paid", "all"] as View[]).map((k) => (
          <Link
            key={k}
            href={k === "upcoming" ? "/obligations" : `/obligations?view=${k}`}
            role="tab"
            aria-selected={view === k}
            className={cn("flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] px-5 text-[14.5px] font-extrabold transition-colors sm:flex-none", view === k ? "bg-white text-cocoa shadow-[0_3px_8px_rgba(58,33,23,0.08)]" : "text-muted hover:text-cocoa")}
          >
            {k[0].toUpperCase() + k.slice(1)}
            <span className={cn("num rounded-full px-1.5 text-[12px]", view === k ? "bg-gold-soft text-gold-ink" : "bg-white/60 text-muted")}>{counts[k]}</span>
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState title={view === "paid" ? "Nothing paid yet" : "You're all caught up"} body={view === "paid" ? "Payments you make through CaiMao show up here." : "No bills are waiting. CaiMao will flag the next one."} />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([month, items]) => (
            <section key={month}>
              <h2 className="mb-3 px-1 font-display text-[18px] font-extrabold text-cocoa">{formatDate(month + "-01", { month: "long", year: "numeric" })}</h2>
              <ul className="space-y-3">
                {items.map((o) => {
                  const date = o.status === "PAID" && o.paid_at ? o.paid_at : o.due_date;
                  const u = urgency(o);
                  const important = o.kind === "tuition" && o.status !== "PAID";
                  return (
                    <li key={o.id} className={cn("cm-lift flex items-center gap-4 rounded-[24px] p-4 shadow-card sm:p-5", important ? "cm-best" : "bg-white")}>
                      <div className={cn("flex w-14 shrink-0 flex-col items-center rounded-[16px] py-2", o.status === "PAID" ? "bg-success-soft" : daysFromToday(o.due_date) <= 7 ? "bg-gold-soft" : "bg-cream")}>
                        <span className="text-[11.5px] font-medium uppercase text-muted">{formatDate(date, { weekday: "short" })}</span>
                        <span className="num font-display text-[22px] font-extrabold leading-tight text-cocoa">{formatDate(date, { day: "numeric" })}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-extrabold text-cocoa">{o.title}</div>
                        <div className="truncate text-[13.5px] text-muted">{o.payee} · <span className="font-mono text-[12.5px]">{o.invoice_ref}</span></div>
                        <div className={cn("mt-1 text-[13.5px] font-medium", u.cls)}>{u.label}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Money amount={o.amount} currency={o.currency} className="text-[17px] font-extrabold text-cocoa" />
                        <StatusBadge status={o.status} size="sm" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
