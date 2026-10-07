import type { Account, Currency } from "@/lib/types";
import { COUNTRY_NAMES } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { Money } from "../money";
import { CurrencyChip } from "../country-chip";
import { cn } from "@/lib/utils";

const SURFACE = ["bg-white", "bg-cream", "bg-[#F8EDDD]"];

/** One account: currency chip, masked number, balance, converted value. Swipeable on phones. */
export function AccountCard({ account, converted, baseCurrency, index = 0 }: { account: Account; converted: number | null; baseCurrency: Currency; index?: number }) {
  return (
    <article className={cn("cm-lift relative flex min-w-[220px] snap-start flex-col rounded-[22px] p-5 sm:min-w-0", SURFACE[index % SURFACE.length], index === 0 && "shadow-card")}>
      <div className="flex items-start justify-between">
        <CurrencyChip currency={account.currency} size={42} />
        <span className="font-mono text-[13px] text-muted">•••• {account.account_last4}</span>
      </div>
      <div className="mt-5 text-[14px] font-semibold text-muted">{account.name}</div>
      <Money amount={account.balance} currency={account.currency} className="mt-0.5 font-display text-[25px] font-extrabold tracking-[-0.03em] text-cocoa" />
      <div className="mt-1 min-h-5 text-[13px] text-muted">
        {converted != null ? `≈ ${formatMoney(converted, baseCurrency)}` : account.kind === "wallet" ? "Multi-currency wallet" : COUNTRY_NAMES[account.country]}
      </div>
    </article>
  );
}
