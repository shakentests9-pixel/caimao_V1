"use client";
import Link from "next/link";
import type { ExecutionOutcome } from "@/lib/finance";
import { formatMoney } from "@/lib/fx/service";
import { Money } from "../money";
import { StatusBadge } from "../status-badge";
import { MascotTile } from "../brand";
import { formatDateTime } from "@/lib/utils";

/**
 * The payoff moment after a payment: a drawn check, the amount, where it went,
 * and the receipt details. CaiMao appears small, as a sign-off rather than a sticker.
 */
export function SuccessState({
  execution,
  isTuition,
  arrival,
  onDone,
  Title,
  Description,
}: {
  execution: ExecutionOutcome;
  isTuition: boolean;
  arrival?: string;
  onDone: () => void;
  /** Accessible title/description primitives from the host dialog. */
  Title: React.ElementType;
  Description: React.ElementType;
}) {
  return (
    <div className="relative overflow-hidden px-6 pb-7 pt-10 text-center sm:px-8">
      <div className="pointer-events-none absolute inset-x-0 -top-28 mx-auto size-[300px] rounded-full bg-gold opacity-20 blur-[80px]" aria-hidden />
      <div className="relative mx-auto flex size-[88px] animate-pop items-center justify-center rounded-[30px] bg-success-soft">
        <svg viewBox="0 0 48 48" className="size-12" aria-hidden>
          <path d="M14 25 L21 32 L35 17" fill="none" stroke="#23794A" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="48" className="animate-draw" />
        </svg>
      </div>
      <Title className="relative mt-6 font-display text-[30px] font-extrabold tracking-[-0.05em] text-cocoa">{isTuition ? "Tuition paid" : "Payment sent"}</Title>
      <Description className="sr-only">Sandbox payment completed</Description>
      <Money amount={execution.destination_amount} currency={execution.destination_currency} className="relative mt-2 block font-display text-[38px] font-extrabold leading-tight tracking-[-0.04em] text-brand" />
      <p className="relative mt-1 text-[15px] text-muted">
        to <span className="font-bold text-cocoa">{execution.recipient.replace(" Treasury", "")}</span>
        {arrival ? (
          <>
            {" "}· expected <span className="font-bold text-cocoa">{arrival}</span>
          </>
        ) : null}
      </p>

      <dl className="relative mt-6 divide-y divide-line rounded-[20px] bg-cream/70 px-4 text-left text-[14px]">
        {[
          ["Transaction", <span key="t" className="font-mono text-[13.5px] font-semibold">{execution.transaction_id}</span>],
          ["Status", <StatusBadge key="s" status="COMPLETED" size="sm" />],
          ["Paid from", <span key="f" className="num">{formatMoney(execution.source_amount, execution.source_currency)}</span>],
          ["New balance", <span key="b" className="num">{formatMoney(execution.new_balance, execution.source_currency)}</span>],
          ["Via", <span key="v">{execution.provider} · <span className="font-mono text-[12.5px] text-muted">{execution.provider_reference}</span></span>],
          ["When", formatDateTime(execution.timestamp)],
        ].map(([k, v]) => (
          <div key={k as string} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-semibold text-cocoa">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="relative mt-6 flex items-center justify-center gap-2 text-[13px] text-muted">
        <MascotTile size={28} />
        CaiMao saved every step to Activity &amp; Security.
      </div>

      <div className="relative mt-4 grid gap-2">
        <Link href="/evidence" onClick={onDone} className="cm-press flex h-12 items-center justify-center rounded-[16px] bg-cream text-[15.5px] font-extrabold text-cocoa hover:bg-sand">
          View receipt
        </Link>
        <button type="button" onClick={onDone} className="cm-press cm-cta flex h-12 items-center justify-center rounded-[16px] text-[15.5px] font-extrabold">
          Done
        </button>
      </div>
    </div>
  );
}
