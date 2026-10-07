import { AlertTriangle, Ban, CheckCircle2, Clock, Hourglass, Info, Loader2, ShieldCheck, Sparkles, XCircle, FlaskConical, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

export type Status =
  | "COMPLIANT"
  | "ACTION_REQUIRED"
  | "BLOCKED"
  | "PAYMENT_DUE"
  | "UPCOMING"
  | "PROCESSING"
  | "PAID"
  | "BEST_VALUE"
  | "COMPLETED"
  | "FAILED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "CANCELLED"
  | "REJECTED"
  | "DEMO_DATA"
  | "ESTIMATE"
  | "SANDBOX"
  | "UNAVAILABLE";

type Def = { label: string; className: string; Icon: typeof Info };

// Every status pairs an icon and a word with its colour, so meaning never relies on colour alone.
const DEFS: Record<Status, Def> = {
  COMPLIANT: { label: "Compliant", className: "bg-success-soft text-success-ink", Icon: ShieldCheck },
  ACTION_REQUIRED: { label: "Action required", className: "bg-warning-soft text-warning-ink", Icon: AlertTriangle },
  BLOCKED: { label: "Blocked", className: "bg-error-soft text-error-ink", Icon: Ban },
  PAYMENT_DUE: { label: "Payment due", className: "bg-warning-soft text-warning-ink", Icon: CalendarClock },
  UPCOMING: { label: "Upcoming", className: "bg-cream text-cocoa-2", Icon: Clock },
  PROCESSING: { label: "Processing", className: "bg-peach-soft text-peach-ink", Icon: Loader2 },
  PAID: { label: "Paid", className: "bg-success-soft text-success-ink", Icon: CheckCircle2 },
  BEST_VALUE: { label: "Best value", className: "bg-gold-soft text-gold-ink", Icon: Sparkles },
  COMPLETED: { label: "Completed", className: "bg-success-soft text-success-ink", Icon: CheckCircle2 },
  FAILED: { label: "Failed", className: "bg-error-soft text-error-ink", Icon: XCircle },
  PENDING_APPROVAL: { label: "Pending approval", className: "bg-brand-soft text-brand", Icon: Hourglass },
  APPROVED: { label: "Approved", className: "bg-brand-soft text-brand", Icon: CheckCircle2 },
  EXECUTING: { label: "Sending", className: "bg-peach-soft text-peach-ink", Icon: Loader2 },
  CANCELLED: { label: "Cancelled", className: "bg-cream text-muted", Icon: XCircle },
  REJECTED: { label: "Rejected", className: "bg-error-soft text-error-ink", Icon: Ban },
  DEMO_DATA: { label: "Demo data", className: "bg-cream text-muted", Icon: FlaskConical },
  ESTIMATE: { label: "Estimate", className: "bg-cream text-muted", Icon: Info },
  SANDBOX: { label: "Sandbox", className: "bg-warning-soft text-warning-ink", Icon: FlaskConical },
  UNAVAILABLE: { label: "Unavailable", className: "bg-cream text-faint", Icon: Ban },
};

export function StatusBadge({ status, className, label, size = "md" }: { status: Status; className?: string; label?: string; size?: "sm" | "md" }) {
  const d = DEFS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold",
        size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[13px]",
        d.className,
        className,
      )}
    >
      <d.Icon className={cn(size === "sm" ? "size-3.5" : "size-[15px]", (status === "EXECUTING" || status === "PROCESSING") && "animate-spin")} aria-hidden />
      {label ?? d.label}
    </span>
  );
}

/** Compliance result with icon + word + colour. */
export function ComplianceBadge({ status, className }: { status: "COMPLIANT" | "ACTION_REQUIRED" | "BLOCKED"; className?: string }) {
  const label = status === "COMPLIANT" ? "Ready to send" : status === "ACTION_REQUIRED" ? "Action needed" : "Blocked";
  return <StatusBadge status={status} label={label} className={className} />;
}
