import { useTranslations } from "next-intl";
import { useDateLocale } from "@/lib/i18n/date";
import type { Transaction } from "@/lib/types";
import { Money } from "../money";
import { CategoryIcon } from "./category";
import { cn, formatDate } from "@/lib/utils";

/** Merchant-style row: category icon, merchant, category + date, signed amount. */
export function TransactionRow({ t, account }: { t: Transaction; account?: string }) {
  const tr = useTranslations("TransactionRow");
  const dl = useDateLocale();
  const incoming = t.amount > 0;
  return (
    <li className="flex items-center gap-3.5 border-b border-line px-1 py-3 last:border-0">
      <CategoryIcon category={t.category} merchant={t.merchant} size={42} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-cocoa">{t.merchant.replace(/ transfer$/, "")}</div>
        <div className="truncate text-[13px] text-muted">
          {tr(`categories.${t.category}`)} · {formatDate(t.date, { day: "numeric", month: "short" }, dl)}
          {account ? ` · ${account}` : ""}
        </div>
      </div>
      <Money amount={t.amount} currency={t.currency} sign className={cn("text-[15px] font-extrabold", incoming ? "text-success-ink" : "text-cocoa")} />
    </li>
  );
}
