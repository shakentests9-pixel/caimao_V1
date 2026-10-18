"use client";
import { useState } from "react";
import { Check, ChevronDown, Clock3 } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useTranslations } from "next-intl";
import type { RemittanceQuote } from "@/lib/types";
import { formatMoney, formatRate } from "@/lib/fx/service";
import { Money } from "../money";
import { QuotesTable, type QuotesView } from "../quotes-table";
import { cn } from "@/lib/utils";

/** Pass a translator for the "TransferProviderCard" namespace. */
export function arrivalLabel(q: Pick<RemittanceQuote, "settlement_business_days">, t: (key: string, values?: { days: number }) => string) {
  return q.settlement_business_days === 0 ? t("arrival.today") : q.settlement_business_days === 1 ? t("arrival.nextBusinessDay") : t("arrival.businessDays", { days: q.settlement_business_days });
}

const shortName = (n: string) => n.replace(/ Demo$/, "");

/** One route, framed around what the recipient receives. Selectable when onSelect is given. */
export function TransferProviderCard({
  quote,
  deliver,
  best,
  selected,
  onSelect,
  advantage,
}: {
  quote: RemittanceQuote;
  deliver?: RemittanceQuote;
  best?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  advantage?: string | null;
}) {
  const t = useTranslations("TransferProviderCard");
  const q = quote;
  const fee = q.transfer_fee + q.other_charges;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[17px] font-extrabold tracking-[-0.02em] text-cocoa">{q.provider_name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
            <Clock3 className="size-3.5" aria-hidden /> {arrivalLabel(q, t)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {best ? <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[12px] font-extrabold text-gold-ink">{t("bestValue")}</span> : null}
          {!best && fee === 0 ? <span className="rounded-full bg-cream px-2.5 py-1 text-[12px] font-bold text-cocoa-2">{t("noTransferFee")}</span> : null}
          {onSelect ? (
            <span className={cn("flex size-6 items-center justify-center rounded-full border-2 transition-colors", selected ? "border-brand bg-brand text-white" : "border-sand bg-white")} aria-hidden>
              {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
          ) : null}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-[13.5px]">
        <div>
          <dt className="text-[12px] text-muted">{t("recipientGets")}</dt>
          <dd><Money amount={q.estimated_recipient_amount} currency={q.destination_currency} className={cn("text-[15.5px] font-extrabold", best ? "text-brand" : "text-cocoa")} /></dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">{t("fee")}</dt>
          <dd className="font-bold text-cocoa">{fee === 0 ? t("none") : formatMoney(fee, q.source_currency)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">{t("rate")}</dt>
          <dd className="num font-mono text-[13px] font-semibold text-cocoa">{formatRate(q.provider_fx_rate)}</dd>
        </div>
      </dl>
      {deliver ? (
        <p className="mt-3 text-[13px] text-muted">
          {t.rich("sendForArrive", {
            send: formatMoney(deliver.source_amount, deliver.source_currency),
            receive: formatMoney(deliver.estimated_recipient_amount, deliver.destination_currency).replace(/\.00$/, ""),
            amt: (c) => <span className="num font-bold text-cocoa-2">{c}</span>,
          })}
        </p>
      ) : null}
      {advantage ? <p className="mt-3 text-[13px] font-bold text-brand">{advantage}</p> : null}
      {!best && fee === 0 && q.fx_spread_pct > 0.01 ? (
        <p className="mt-3 text-[12.5px] text-muted">{t("spreadNote", { pct: (q.fx_spread_pct * 100).toFixed(1) })}</p>
      ) : null}
      {q.unavailable_reason ? <p className="mt-2 text-[13px] text-muted">{q.unavailable_reason}</p> : null}
    </>
  );

  const shell = cn(
    "block w-full rounded-[22px] p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 sm:p-5",
    selected ? "border-2 border-brand bg-ivory shadow-card" : best ? "cm-best shadow-card" : "border-2 border-transparent bg-white shadow-card",
    !q.available && "opacity-60",
  );

  return onSelect && q.available ? (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cn(shell, "cm-press cm-lift")}>
      {body}
    </button>
  ) : (
    <article className={shell}>{body}</article>
  );
}

/** Provider list with the full technical table one tap away. */
export function ProviderComparison({ view, selectedId, onSelect, defaultOpenTable = false }: { view: QuotesView; selectedId?: string | null; onSelect?: (id: string) => void; defaultOpenTable?: boolean }) {
  const t = useTranslations("TransferProviderCard");
  const [open, setOpen] = useState(defaultOpenTable);
  const best = view.quotes.find((q) => q.provider_id === view.best_provider_id);
  const lowestFeeName = view.quotes.find((q) => q.provider_id === view.lowest_fee_provider_id)?.provider_name;
  const vsLowestFee = view.advantage_vs.find((a) => a.provider_name === lowestFeeName);
  const headline = vsLowestFee ?? view.advantage_vs[view.advantage_vs.length - 1];
  const dst = view.quotes[0]?.destination_currency;
  const advantage =
    best && headline && dst ? t("advantage", { amount: formatMoney(headline.extra_recipient_amount, dst), provider: shortName(headline.provider_name), rate: formatRate(best.provider_fx_rate) }) : null;

  return (
    <div>
      <div className="space-y-3">
        {view.quotes.map((q) => (
          <TransferProviderCard
            key={q.id}
            quote={q}
            deliver={view.delivery_quotes.find((d) => d.provider_id === q.provider_id)}
            best={q.provider_id === view.best_provider_id}
            selected={selectedId === q.provider_id}
            onSelect={onSelect ? () => onSelect(q.provider_id) : undefined}
            advantage={q.provider_id === view.best_provider_id ? advantage : null}
          />
        ))}
      </div>
      <Collapsible.Root open={open} onOpenChange={setOpen} className="mt-3">
        <Collapsible.Trigger className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-[14.5px] font-bold text-brand hover:underline">
          {open ? t("hideFullComparison") : t("seeFullComparison")}
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </Collapsible.Trigger>
        <Collapsible.Content className="mt-2 data-[state=open]:animate-rise">
          <QuotesTable view={view} />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

/**
 * The assistant's recommendation: the best route summarised for this payment,
 * with every route and the full table available underneath.
 */
export function BestOptionCard({ view, onPrepare, prepareLabel }: { view: QuotesView; onPrepare?: () => void; prepareLabel?: string }) {
  const t = useTranslations("TransferProviderCard");
  const [showAll, setShowAll] = useState(false);
  const best = view.quotes.find((q) => q.provider_id === view.best_provider_id);
  if (!best) return <ProviderComparison view={view} />;
  const deliver = view.delivery_quotes.find((d) => d.provider_id === best.provider_id);
  const shown = deliver ?? best;
  const lowestFeeName = view.quotes.find((q) => q.provider_id === view.lowest_fee_provider_id)?.provider_name;
  const vs = view.advantage_vs.find((a) => a.provider_name === lowestFeeName) ?? view.advantage_vs[view.advantage_vs.length - 1];

  return (
    <div className="cm-best rounded-[24px] p-5 shadow-card sm:p-6">
      <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-gold-ink">{t("bestOption")}</span>
      <h3 className="mt-3 font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{best.provider_name}</h3>
      <p className="text-[14.5px] text-muted">
        {vs ? t("moreArrives", { amount: formatMoney(vs.extra_recipient_amount, best.destination_currency), provider: shortName(vs.provider_name) }) : t("mostArrives")} {t("estimateNote")}
      </p>
      <dl className="mt-4 space-y-2.5 rounded-[18px] bg-cream p-4 text-[14.5px]">
        <div className="flex justify-between gap-3"><dt className="text-cocoa-2">{t("youSend")}</dt><dd><Money amount={shown.source_amount} currency={shown.source_currency} className="font-extrabold text-cocoa" /></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-cocoa-2">{t("recipientGets")}</dt><dd><Money amount={shown.estimated_recipient_amount} currency={shown.destination_currency} className="font-extrabold text-brand" /></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-cocoa-2">{t("fee")}</dt><dd className="font-bold text-cocoa">{shown.transfer_fee + shown.other_charges === 0 ? t("none") : formatMoney(shown.transfer_fee + shown.other_charges, shown.source_currency)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-cocoa-2">{t("arrival.label")}</dt><dd className="font-bold text-cocoa">{arrivalLabel(best, t)}</dd></div>
      </dl>
      {onPrepare ? (
        <button type="button" onClick={onPrepare} className="cm-press cm-cta mt-5 flex h-12 w-full items-center justify-center rounded-[16px] text-[15.5px] font-extrabold">
          {prepareLabel ?? t("preparePayment")}
        </button>
      ) : null}
      <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-brand hover:underline">
        {showAll ? t("hideOtherRoutes") : t("compareAllRoutes", { count: view.quotes.length })}
        <ChevronDown className={cn("size-4 transition-transform", showAll && "rotate-180")} />
      </button>
      {showAll ? (
        <div className="mt-2 animate-rise">
          <ProviderComparison view={view} />
        </div>
      ) : null}
    </div>
  );
}
