import { formatMoney } from "@/lib/fx/service";
import type { Currency } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Amount with a quieter currency code. Tabular figures so columns line up. */
export function Money({ amount, currency, className, sign, codeClassName, hidden }: { amount: number; currency: Currency; className?: string; sign?: boolean; codeClassName?: string; hidden?: boolean }) {
  const text = formatMoney(amount, currency, { sign });
  const [prefix, ...rest] = text.split(" ");
  const signed = prefix.startsWith("−") || prefix.startsWith("+");
  const code = signed ? prefix.slice(1) : prefix;
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      {signed ? prefix[0] : ""}
      <span className={cn("mr-[0.25em] text-[0.72em] font-medium tracking-wide text-muted", codeClassName)}>{code}</span>
      {hidden ? "••••••" : rest.join(" ")}
    </span>
  );
}
