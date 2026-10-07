"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, Clock3, Loader2 } from "lucide-react";
import type { Currency } from "@/lib/types";
import { CURRENCY_DECIMALS, formatMoney, formatRate } from "@/lib/fx/service";
import type { QuotesView } from "../quotes-table";
import { CurrencySelector } from "./currency-selector";
import { ProviderComparison, arrivalLabel } from "./transfer-provider-card";
import { cn } from "@/lib/utils";

const COUNTRY_WORD: Record<Currency, string> = { SGD: "Singapore", GBP: "the UK", USD: "the US", CNY: "China", HKD: "Hong Kong", VND: "Vietnam" };

/**
 * Send / receive card plus the provider list. Quotes come from /api/quotes, which runs
 * the same engine as the assistant; selecting a provider updates the receive amount.
 */
export function TransferCalculator({ initial, from: from0, to: to0, amount: amount0, aside }: { initial: QuotesView; from: Currency; to: Currency; amount: number; aside?: React.ReactNode }) {
  const [from, setFrom] = useState<Currency>(from0);
  const [to, setTo] = useState<Currency>(to0);
  const [raw, setRaw] = useState(String(amount0));
  const [view, setView] = useState<QuotesView>(initial);
  const [selected, setSelected] = useState<string | null>(initial.best_provider_id);
  const [loading, setLoading] = useState(false);
  const [spin, setSpin] = useState(false);
  const loaded = useRef({ from: from0, to: to0, amount: amount0 });

  const amount = Number(raw.replace(/,/g, "")) || 0;

  useEffect(() => {
    const l = loaded.current;
    if (l.from === from && l.to === to && l.amount === amount) return;
    if (!(amount > 0) || from === to) return;
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quotes?from=${from}&to=${to}&amount=${amount}`, { signal: ctrl.signal });
        if (res.ok) {
          const v = (await res.json()) as QuotesView;
          loaded.current = { from, to, amount };
          setView(v);
          setSelected(v.best_provider_id);
        }
      } catch {
        /* superseded */
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [from, to, amount]);

  const quote = useMemo(() => view.quotes.find((q) => q.provider_id === selected) ?? view.quotes[0], [view, selected]);
  const receive = quote?.estimated_recipient_amount ?? 0;
  const d = CURRENCY_DECIMALS[to];
  const href = `/copilot?q=${encodeURIComponent(`Send money overseas: ${from} ${amount} to ${COUNTRY_WORD[to]}`)}`;
  const disabled = from === to || !amount;
  const fee = quote ? quote.transfer_fee + quote.other_charges : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(340px,0.92fr)_minmax(0,1.08fr)] lg:gap-8">
      <div className="space-y-6">
        <section className="rounded-[28px] bg-white p-5 shadow-card sm:p-6" aria-label="Transfer calculator">
          <label htmlFor="send-amount" className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">You send</label>
          <div className="mt-2 flex items-center gap-3 rounded-[20px] bg-cream px-4 py-3">
            <input
              id="send-amount"
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ""))}
              className="num min-w-0 flex-1 bg-transparent font-display text-[32px] font-extrabold tracking-[-0.04em] text-cocoa outline-none sm:text-[38px]"
              aria-describedby="rate-line"
            />
            <CurrencySelector value={from} onChange={setFrom} label="Send currency" />
          </div>

          <div className="relative z-10 my-2.5 flex items-center gap-3 pl-3">
            <button
              type="button"
              onClick={() => {
                setSpin(true);
                setTimeout(() => setSpin(false), 300);
                setFrom(to);
                setTo(from);
              }}
              className="cm-press flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-cocoa hover:bg-sand"
              aria-label="Swap currencies"
            >
              <ArrowDownUp className={cn("size-5 transition-transform duration-300", spin && "rotate-180")} />
            </button>
            <span id="rate-line" className="min-w-0 text-[14px] leading-5 text-cocoa-2">
              {quote ? (
                <>
                  <span className="num whitespace-nowrap font-mono text-[13.5px] font-semibold">1 {from} = {formatRate(quote.provider_fx_rate)} {to}</span>
                  <span className="block text-muted sm:inline"><span className="hidden sm:inline"> · </span>fee {fee === 0 ? "none" : formatMoney(fee, from)}</span>
                </>
              ) : null}
              {loading && <Loader2 className="ml-2 inline size-4 animate-spin text-brand" aria-label="Updating" />}
            </span>
          </div>

          <div className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">They receive</div>
          <div className="mt-2 flex items-center gap-3 rounded-[20px] bg-cream px-4 py-3">
            <output className={cn("num min-w-0 flex-1 truncate font-display text-[32px] font-extrabold tracking-[-0.04em] text-brand transition-opacity sm:text-[38px]", loading && "opacity-50")} aria-live="polite">
              {from === to ? "—" : new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }).format(receive)}
            </output>
            <CurrencySelector value={to} onChange={setTo} label="Receive currency" />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[14px]">
            <span className="text-cocoa-2">{quote ? <>via <strong className="font-extrabold text-cocoa">{quote.provider_name}</strong></> : null}</span>
            {quote ? (
              <span className="flex items-center gap-1.5 font-extrabold text-success-ink">
                <Clock3 className="size-4" /> Estimated arrival: {arrivalLabel(quote)}
              </span>
            ) : null}
          </div>

          <Link href={href} className={cn("cm-press cm-cta mt-6 hidden h-[54px] w-full items-center justify-center gap-2 rounded-[16px] text-[16px] font-extrabold sm:flex", disabled && "pointer-events-none opacity-45")}>
            Continue with CaiMao
          </Link>
          <p className="mt-3 text-center text-[13px] text-muted">Estimates at demo rates. CaiMao checks the transfer rules before anything is prepared.</p>
        </section>
        {aside}
      </div>

      {from !== to && (
        <section aria-label="Providers">
          <div className="mb-4 px-1">
            <h2 className="font-display text-[22px] font-extrabold tracking-[-0.04em] text-cocoa">Compare providers</h2>
            <p className="text-[14.5px] text-muted">Ranked by what actually arrives. A zero fee isn&apos;t always cheapest.</p>
          </div>
          <ProviderComparison view={view} selectedId={selected} onSelect={setSelected} />
        </section>
      )}

      {/* Phones: the next step stays in reach above the bottom bar. */}
      <div className="fixed inset-x-4 bottom-[86px] z-30 sm:hidden">
        <Link href={href} className={cn("cm-press cm-cta flex h-[54px] w-full items-center justify-center gap-2 rounded-[16px] text-[16px] font-extrabold shadow-float", disabled && "pointer-events-none opacity-45")}>
          Continue with CaiMao
        </Link>
      </div>
      <div className="h-14 sm:hidden" aria-hidden />
    </div>
  );
}
