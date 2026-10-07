import { Check, X } from "lucide-react";
import type { AuditLog } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Plain-language names for the audit actions shown in the timeline. */
export function friendlyAction(l: AuditLog, firstName: string): string {
  switch (l.action) {
    case "TRANSFER_RULE_CHECK":
      return l.result === "BLOCKED" ? "Transfer requirements not met" : "Transfer requirements checked";
    case "QUOTE_RETRIEVAL":
      return "Quotes collected";
    case "COST_CALCULATION":
      return "Providers compared";
    case "TRANSFER_PREPARED":
      return "Transfer ready to review";
    case "TRANSFER_REJECTED":
      return "Transfer stopped before it was prepared";
    case "USER_APPROVAL":
      return `Approved by ${firstName}`;
    case "USER_DECLINED":
      return `Cancelled by ${firstName}`;
    case "TRANSFER_EXECUTED":
      return "Payment executed";
    case "TRANSFER_FAILED":
      return "Payment failed";
    case "BALANCE_UPDATED":
      return "Balance updated";
    case "OBLIGATION_PAID":
      return "Tuition marked paid";
    case "PERMISSION_DENIED":
      return "Blocked by your AI permission setting";
    default:
      return l.action;
  }
}

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));

/** Vertical, plain-language timeline of one workflow run. The raw log stays available in the technical view. */
export function ActivityTimeline({ logs, firstName }: { logs: AuditLog[]; firstName: string }) {
  if (logs.length === 0) return <p className="mt-3 text-[15px] text-muted">Nothing to show yet.</p>;
  return (
    <ol className="mt-5">
      {logs.map((l, i) => {
        const ok = l.result === "SUCCESS" && l.action !== "USER_DECLINED";
        const approval = l.action === "USER_APPROVAL";
        return (
          <li key={l.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < logs.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-[2px] rounded-full bg-sand" aria-hidden />}
            <span className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full", !ok ? "bg-error-soft text-error-ink" : approval ? "bg-brand text-white" : "bg-success-soft text-success-ink")}>
              {ok ? <Check className="size-4" strokeWidth={3} aria-label="done" /> : <X className="size-4" strokeWidth={3} aria-label="stopped" />}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="num font-mono text-[12.5px] text-muted">{time(l.timestamp)}</div>
              <div className={cn("text-[15.5px] font-bold", ok ? "text-cocoa" : "text-error-ink")}>{friendlyAction(l, firstName)}</div>
              <div className="mt-0.5 text-[13px] text-muted">
                {l.actor === "user" ? "You" : "CaiMao"} · {approval ? "your approval" : `permission level ${l.permission_level}`}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
