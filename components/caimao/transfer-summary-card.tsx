import { ArrowDown } from "lucide-react";
import type { CountryCode, Currency } from "@/lib/types";
import { Money } from "../money";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The money at the centre of a transfer: what leaves, what arrives, and the route.
 * Used on the review sheet, the prepared-transfer card and the verified transfer.
 */
export function TransferSummaryCard({
  send,
  receive,
  from,
  to,
  receiveLabel,
  tone = "cream",
  className,
}: {
  send: { amount: number; currency: Currency };
  receive: { amount: number; currency: Currency };
  from: CountryCode;
  to: CountryCode;
  receiveLabel?: string;
  tone?: "cream" | "premium" | "white";
  className?: string;
}) {
  const t = useTranslations("TransferSummaryCard");
  const tc = useTranslations("Countries");
  const premium = tone === "premium";
  return (
    <div className={cn("relative overflow-hidden rounded-[24px] px-5 py-6 text-center", tone === "cream" && "bg-cream", tone === "white" && "bg-white shadow-card", premium && "cm-premium cm-ring", className)}>
      <div className={cn("text-[13px] font-semibold", premium ? "text-cream" : "text-muted")}>{t("youSend")}</div>
      <Money amount={send.amount} currency={send.currency} className={cn("font-display text-[32px] font-extrabold tracking-[-0.04em] sm:text-[36px]", premium ? "text-white" : "text-cocoa")} codeClassName={premium ? "text-cream/80" : undefined} />
      <div className="my-2 flex justify-center" aria-hidden>
        <span className={cn("flex size-8 items-center justify-center rounded-full", premium ? "bg-white/10 text-gold" : "bg-white text-brand")}>
          <ArrowDown className="size-[18px] animate-nudge" />
        </span>
      </div>
      <div className={cn("text-[13px] font-semibold", premium ? "text-cream" : "text-muted")}>{receiveLabel ?? t("theyReceive")}</div>
      <Money amount={receive.amount} currency={receive.currency} className={cn("font-display text-[32px] font-extrabold tracking-[-0.04em] sm:text-[36px]", premium ? "text-gold" : "text-brand")} codeClassName={premium ? "text-cream/80" : undefined} />
      <div className={cn("mt-5 flex items-center justify-center gap-3 text-[13px] font-bold", premium ? "text-cream" : "text-cocoa-2")} aria-label={t("routeAria", { from: tc(from), to: tc(to) })}>
        <span>{tc(from)}</span>
        <span className="w-14 border-t-2 border-dashed border-gold" aria-hidden />
        <span>{tc(to)}</span>
      </div>
    </div>
  );
}
