"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, CircleAlert, FileCheck2, GraduationCap, ShieldAlert, Wallet, CalendarClock } from "lucide-react";
import type { AgentCard } from "@/lib/agent/protocol";
import { COUNTRY_NAMES } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { Money } from "./money";
import { StatusBadge, type Status } from "./status-badge";
import { CompliancePanel, DocumentList, RulesTable } from "./compliance-panel";
import { BestOptionCard } from "./caimao/transfer-provider-card";
import { TransferSummaryCard } from "./caimao/transfer-summary-card";
import { CurrencyChip } from "./country-chip";
import { CreditCardVisual } from "./caimao/credit-card-visual";
import { ChecklistCard } from "./caimao/checklist-card";
import { CATEGORY } from "./caimao/category";
import { Button } from "./ui/button";
import { cn, dueText, formatDate } from "@/lib/utils";

type Card<K extends AgentCard["kind"]> = Extract<AgentCard, { kind: K }>;

/** One row in a summary card: icon tile, title, supporting line, value on the right. */
function Row({ icon, title, sub, value, tone = "default" }: { icon: React.ReactNode; title: string; sub?: React.ReactNode; value?: React.ReactNode; tone?: "default" | "ok" | "bad" | "warn" }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-3.5 first:pt-0 last:border-0 last:pb-0">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[14px]", tone === "ok" ? "bg-success-soft text-success-ink" : tone === "bad" ? "bg-error-soft text-error-ink" : tone === "warn" ? "bg-warning-soft text-warning-ink" : "bg-cream text-cocoa")}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {/* Title and value share the first line so the supporting text gets the full width on phones. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-0.5">
          <div className="text-[15px] font-bold text-cocoa">{title}</div>
          {value ? <div className="ml-auto text-right">{value}</div> : null}
        </div>
        {sub ? <div className="text-[13px] leading-5 text-muted">{sub}</div> : null}
      </div>
    </div>
  );
}

/**
 * Tuition, available funds and transfer requirements in one card, as CaiMao checks them.
 * Each value comes from the tool results; the rule-by-rule detail is one tap away.
 */
export function PaymentSnapshot({ obligation, funds, compliance }: { obligation?: Card<"obligations">; funds?: Card<"funds">; compliance?: Card<"compliance"> }) {
  const t = useTranslations("AgentCards");
  const [open, setOpen] = useState(false);
  const o = obligation?.obligations.find((x) => x.id === obligation.focus_id);
  const r = compliance?.result;
  const docs = r?.required_documents ?? [];
  const missing = docs.filter((d) => !d.on_file);
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-card">
      {o ? (
        <Row
          icon={<GraduationCap className="size-5" />}
          title={o.title}
          sub={
            <>
              {o.payee.replace(" Treasury", "")} · {o.status === "PAID" ? t("paid") : dueText(o.days_until)} · <span className="font-mono text-[12px]">{o.invoice_ref}</span>
            </>
          }
          value={<Money amount={o.amount} currency={o.currency} className="text-[16px] font-extrabold text-cocoa" />}
        />
      ) : null}
      {funds ? (
        <Row
          icon={<Wallet className="size-5" />}
          tone={funds.sufficient ? "default" : "bad"}
          title={t("availableFunds")}
          sub={`${funds.account.replace("****", "•••• ")} · ${funds.sufficient ? t("enoughToCover") : t("needsAbout", { amount: formatMoney(funds.required_estimate, funds.currency) })}`}
          value={<Money amount={funds.available} currency={funds.currency} className={cn("text-[16px] font-extrabold", funds.sufficient ? "text-cocoa" : "text-error-ink")} />}
        />
      ) : null}
      {r ? (
        <>
          <Row
            icon={r.status === "COMPLIANT" ? <FileCheck2 className="size-5" /> : r.status === "BLOCKED" ? <ShieldAlert className="size-5" /> : <CircleAlert className="size-5" />}
            tone={r.status === "COMPLIANT" ? "ok" : r.status === "BLOCKED" ? "bad" : "warn"}
            title={t("transferRequirements")}
            sub={
              r.status === "COMPLIANT"
                ? `${t("checked")} · ${docs.length ? t("documentsReady", { ready: docs.length, total: docs.length }) : t("rulesMet", { count: r.evaluations.length })}`
                : r.status === "BLOCKED"
                  ? t("ruleBlocks")
                  : missing.length
                    ? t("missing", { names: missing.map((m) => m.name).join(", ") })
                    : t("cannotClear")
            }
            value={<span className={cn("text-[14.5px] font-extrabold", r.status === "COMPLIANT" ? "text-success-ink" : r.status === "BLOCKED" ? "text-error-ink" : "text-warning-ink")}>{r.status === "COMPLIANT" ? t("ready") : r.status === "BLOCKED" ? t("blocked") : t("actionNeeded")}</span>}
          />
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-brand hover:underline">
            {open ? t("hideRules") : t("seeRules", { count: r.evaluations.length })}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          {open ? (
            <div className="mt-1 animate-rise space-y-3">
              <CompliancePanel result={r} />
              {docs.length > 0 && <DocumentList docs={docs} />}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Cards rendered inside CaiMao's replies. Every number comes from a tool result. */
export function AgentCardView({
  card,
  instructionStatus,
  onReview,
  onPrepare,
  prepareLabel,
}: {
  card: AgentCard;
  instructionStatus?: Status;
  onReview?: () => void;
  onPrepare?: () => void;
  prepareLabel?: string;
}) {
  const t = useTranslations("AgentCards");
  const tc = useTranslations("Countries");
  switch (card.kind) {
    case "obligations": {
      const o = card.obligations.find((x) => x.id === card.focus_id);
      if (o) return <PaymentSnapshot obligation={card} />;
      return (
        <div className="rounded-[24px] bg-white p-5 shadow-card">
          {card.obligations.map((x) => (
            <Row key={x.id} icon={<CalendarClock className="size-5" />} title={x.title} sub={x.status === "PAID" ? t("paid") : dueText(x.days_until)} value={<Money amount={x.amount} currency={x.currency} className="font-extrabold" />} />
          ))}
        </div>
      );
    }
    case "accounts":
      return (
        <div className="cm-scroll-x -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {card.accounts.map((a) => (
            <div key={a.id} className="flex min-w-[200px] items-center gap-3 rounded-[20px] bg-white p-3.5 shadow-card">
              <CurrencyChip currency={a.currency} size={38} />
              <div className="min-w-0">
                <div className="truncate text-[12.5px] text-muted">{a.name} •••• {a.account_last4}</div>
                <Money amount={a.balance} currency={a.currency} className="text-[16px] font-extrabold text-cocoa" />
              </div>
            </div>
          ))}
        </div>
      );
    case "funds":
      return <PaymentSnapshot funds={card} />;
    case "compliance":
      return <PaymentSnapshot compliance={card} />;
    case "rules":
      return (
        <div className="rounded-[24px] bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-display text-[18px] font-extrabold tracking-[-0.02em]">{t("rulesFor", { corridor: card.corridor })}</span>
            <StatusBadge status="DEMO_DATA" label={t("simulatedRules")} size="sm" />
          </div>
          <RulesTable rules={card.rules} />
        </div>
      );
    case "quotes":
      return <BestOptionCard view={card} onPrepare={onPrepare} prepareLabel={prepareLabel} />;
    case "instruction": {
      const r = card.request;
      const status = instructionStatus ?? "PENDING_APPROVAL";
      const pending = status === "PENDING_APPROVAL";
      const from = r.compliance_snapshot.source_country;
      return (
        <div className={cn("overflow-hidden rounded-[24px] p-5 shadow-card", pending ? "cm-insight" : "bg-white")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-[19px] font-extrabold tracking-[-0.03em] text-cocoa">
              {pending ? t("instruction.readyToReview") : status === "COMPLETED" ? (card.obligation_title?.toLowerCase().includes("tuition") ? t("instruction.tuitionPaid") : t("instruction.transferSent")) : status === "CANCELLED" ? t("instruction.transferCancelled") : t("instruction.transfer")}
            </span>
            <StatusBadge status={status} />
          </div>
          <TransferSummaryCard
            className="mt-4"
            tone="white"
            send={{ amount: r.source_amount, currency: r.source_currency }}
            receive={{ amount: r.destination_amount, currency: r.destination_currency }}
            from={from}
            to={r.recipient_country}
            receiveLabel={t("receives", { recipient: r.recipient.replace(" Treasury", "") })}
          />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
            <div><dt className="text-muted">{t("instruction.from")}</dt><dd className="font-bold text-cocoa">{card.account_label.replace("****", "•••• ")}</dd></div>
            <div><dt className="text-muted">{t("instruction.provider")}</dt><dd className="font-bold text-cocoa">{card.provider_name}</dd></div>
            <div><dt className="text-muted">{t("instruction.fee")}</dt><dd className="font-bold text-cocoa">{formatMoney(r.transfer_fee, r.source_currency)}</dd></div>
            <div><dt className="text-muted">{t("instruction.arrives")}</dt><dd className="font-bold text-cocoa">{formatDate(r.estimated_settlement_date, { weekday: "short", day: "numeric", month: "short" })}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="max-w-[34ch] text-[13.5px] text-muted">
              {pending
                ? t("instruction.notePending")
                : status === "COMPLETED"
                  ? t("instruction.noteCompleted")
                  : status === "CANCELLED"
                    ? t("instruction.noteCancelled")
                    : status === "FAILED"
                      ? t("instruction.noteFailed")
                      : ""}
            </span>
            {pending && onReview ? (
              <Button onClick={onReview}>{t("instruction.reviewTransfer")}</Button>
            ) : status === "COMPLETED" ? (
              <Button variant="soft" size="sm" asChild><Link href="/evidence">{t("instruction.viewReceipt")}</Link></Button>
            ) : null}
          </div>
        </div>
      );
    }
    case "blocked": {
      const action = card.title.toLowerCase().startsWith("action required");
      return (
        <div className={cn("rounded-[24px] p-5", action ? "bg-warning-soft" : "bg-error-soft")}>
          <div className={cn("flex items-center gap-2 font-display text-[18px] font-extrabold", action ? "text-warning-ink" : "text-error-ink")}>
            {action ? <CircleAlert className="size-5" /> : <ShieldAlert className="size-5" />} {action ? t("blockedCard.actionRequired") : card.title === "Transaction blocked" ? t("blockedCard.blocked") : card.title}
          </div>
          <p className="mt-1.5 text-[15px] text-cocoa">{card.reason}</p>
          {card.items.length > 0 && (
            <ul className="mt-2 space-y-1">
              {card.items.map((i) => (
                <li key={i} className="flex gap-2 text-[14px] text-cocoa-2">
                  <span aria-hidden>•</span> {i}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "spending": {
      const s = card.summary;
      const cats = s.categories.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
      const max = Math.max(...cats.map((c) => c.amount), 1);
      return (
        <div className="rounded-[24px] bg-white p-5 shadow-card">
          <div className="grid grid-cols-3 gap-2">
            {[
              [t("spending.in"), s.income],
              [t("spending.spent"), s.expenses],
              [t("spending.saved"), s.savings],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-[16px] bg-cream px-3 py-2.5">
                <div className="text-[12.5px] text-muted">{k}</div>
                <Money amount={v as number} currency={s.currency} className="text-[15.5px] font-extrabold text-cocoa" />
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {cats.map((c) => (
              <li key={c.category} className="flex items-center gap-3 text-[14px]">
                <span className="w-28 truncate text-cocoa-2">{CATEGORY[c.category].label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
                  <span className="block h-full rounded-full" style={{ width: `${(c.amount / max) * 100}%`, background: CATEGORY[c.category].color }} />
                </span>
                <Money amount={c.amount} currency={s.currency} className="w-24 text-right font-bold" />
              </li>
            ))}
          </ul>
          {s.available_after_obligations ? (
            <p className="mt-4 flex items-center gap-2 text-[14px] text-cocoa-2">
              <Wallet className="size-4 text-brand" /> {t.rich("spending.leftAfterBills", { amount: formatMoney(s.available_after_obligations, s.currency), b: (c) => <span className="num font-extrabold">{c}</span> })}
            </p>
          ) : null}
        </div>
      );
    }
    case "credit":
      return <CreditCardVisual card={card.card} className="max-w-[340px]" />;
    case "checklist":
      return (
        <ChecklistCard
          numbered
          title={t("bankingIn", { country: card.country in COUNTRY_NAMES ? tc(card.country) : card.country })}
          subtitle={
            <Link href="/banking" className="text-[14px] font-bold text-brand hover:underline">
              {t("openChecklist")}
            </Link>
          }
          items={card.items.map((i) => ({ id: i.id, label: i.label, state: i.completed ? "done" : "todo", stateLabel: i.completed ? t("ready") : undefined }))}
        />
      );
  }
}
