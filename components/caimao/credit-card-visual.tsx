import type { CreditCard } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { cn, formatDate } from "@/lib/utils";
import { useTranslations } from "next-intl";

/** The student's card as a digital card: issuer, last four, used vs limit, due date. */
export function CreditCardVisual({ card, className }: { card: CreditCard; className?: string }) {
  const utilisation = card.current_balance / card.credit_limit;
  const issuer = card.issuer.replace(/ Student Credit Card$/i, "");
  const t = useTranslations("CreditCardVisual");
  return (
    <div
      className={cn("cm-premium cm-ring relative isolate aspect-[1.586/1] w-full max-w-[400px] overflow-hidden rounded-[24px] p-6 shadow-float", className)}
      role="img"
      aria-label={t("ariaLabel", { issuer: card.issuer, last4: card.last4, used: formatMoney(card.current_balance, card.currency), limit: formatMoney(card.credit_limit, card.currency), due: formatDate(card.payment_due_date) })}
    >
      <div className="cm-dots pointer-events-none absolute inset-0 -z-10 opacity-40" />
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display text-[19px] font-extrabold leading-tight">{issuer}</div>
          <div className="text-[13px] text-cream">{t("studentCredit")}</div>
        </div>
        <svg width="40" height="30" viewBox="0 0 40 30" aria-hidden>
          <rect x="0.5" y="0.5" width="39" height="29" rx="6" fill="#F5B14C" stroke="#d9963a" />
          <path d="M0 10h14M0 20h14M26 10h14M26 20h14M14 0v30M26 0v30" stroke="#c4822e" strokeWidth="1" />
        </svg>
      </div>
      <div className="mt-[11%] font-mono text-[17px] tracking-[0.18em] text-cream">•••• •••• •••• {card.last4}</div>
      <div className="absolute inset-x-6 bottom-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="num font-display text-[21px] font-extrabold">{t("used", { amount: formatMoney(card.current_balance, card.currency).replace(".00", "") })}</div>
            <div className="text-[13px] text-cream">{t("limitDue", { limit: formatMoney(card.credit_limit, card.currency).replace(".00", ""), due: formatDate(card.payment_due_date, { day: "numeric", month: "short" }) })}</div>
          </div>
          <div className="num text-right font-display text-[22px] font-extrabold text-gold">{Math.round(utilisation * 100)}%</div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, utilisation * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
