import { Check } from "lucide-react";
import type { Obligation } from "@/lib/types";
import { Money } from "../money";
import { StatusBadge } from "../status-badge";
import { cn, daysFromToday, formatDate } from "@/lib/utils";

export function dueLabel(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${-days}d late`;
  return `${days} days`;
}

/** Upcoming and paid obligations as a vertical timeline. */
export function ObligationTimeline({ items, highlightKind = "tuition", action }: { items: Obligation[]; highlightKind?: Obligation["kind"]; action?: (o: Obligation) => React.ReactNode }) {
  return (
    <ol>
      {items.map((o) => {
        const days = daysFromToday(o.due_date);
        const paid = o.status === "PAID";
        const highlight = o.kind === highlightKind && !paid;
        const soon = !paid && days <= 7;
        return (
          <li key={o.id} className="relative flex gap-3 pb-4 last:pb-0 sm:gap-4">
            <div className="flex w-[54px] shrink-0 flex-col items-end pt-3 text-right sm:w-[62px]">
              <span className={cn("font-display text-[16px] font-extrabold leading-5", paid ? "text-success-ink" : soon ? "text-brand" : "text-cocoa")}>{paid ? "Paid" : dueLabel(days)}</span>
              <span className="text-[12px] text-muted">{formatDate(paid && o.paid_at ? o.paid_at : o.due_date, { day: "numeric", month: "short" })}</span>
            </div>
            <div className="relative flex flex-col items-center" aria-hidden>
              <span className={cn("mt-4 flex size-4 items-center justify-center rounded-full ring-4 ring-white", paid ? "bg-success-ink" : highlight ? "bg-brand" : soon ? "bg-gold" : "bg-sand")}>
                {paid ? <Check className="size-2.5 text-white" strokeWidth={4} /> : null}
              </span>
              <span className="mt-1 w-px flex-1 bg-line" />
            </div>
            <div className={cn("min-w-0 flex-1 rounded-[20px] p-4", highlight ? "cm-insight" : "bg-cream/70")}>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <div className="text-[15.5px] font-bold leading-snug text-cocoa">{o.title}</div>
                  <div className="truncate text-[13px] text-muted">{o.payee}</div>
                </div>
                <Money amount={o.amount} currency={o.currency} className={cn("text-[16px] font-extrabold", paid ? "text-muted" : "text-cocoa")} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={o.status} size="sm" label={o.status === "PAYMENT_DUE" && soon ? "Due soon" : undefined} />
                {action?.(o)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
