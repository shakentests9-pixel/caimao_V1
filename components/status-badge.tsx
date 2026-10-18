import { AlertTriangle, Ban, CheckCircle2, Clock, Hourglass, Info, Loader2, ShieldCheck, Sparkles, XCircle, FlaskConical, CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
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

type Def = { className: string; Icon: typeof Info };

// Every status pairs an icon and a word with its colour, so meaning never relies on colour alone.
const DEFS: Record<Status, Def> = {
  COMPLIANT: { className: "bg-success-soft text-success-ink", Icon: ShieldCheck },
  ACTION_REQUIRED: { className: "bg-warning-soft text-warning-ink", Icon: AlertTriangle },
  BLOCKED: { className: "bg-error-soft text-error-ink", Icon: Ban },
  PAYMENT_DUE: { className: "bg-warning-soft text-warning-ink", Icon: CalendarClock },
  UPCOMING: { className: "bg-cream text-cocoa-2", Icon: Clock },
  PROCESSING: { className: "bg-peach-soft text-peach-ink", Icon: Loader2 },
  PAID: { className: "bg-success-soft text-success-ink", Icon: CheckCircle2 },
  BEST_VALUE: { className: "bg-gold-soft text-gold-ink", Icon: Sparkles },
  COMPLETED: { className: "bg-success-soft text-success-ink", Icon: CheckCircle2 },
  FAILED: { className: "bg-error-soft text-error-ink", Icon: XCircle },
  PENDING_APPROVAL: { className: "bg-brand-soft text-brand", Icon: Hourglass },
  APPROVED: { className: "bg-brand-soft text-brand", Icon: CheckCircle2 },
  EXECUTING: { className: "bg-peach-soft text-peach-ink", Icon: Loader2 },
  CANCELLED: { className: "bg-cream text-muted", Icon: XCircle },
  REJECTED: { className: "bg-error-soft text-error-ink", Icon: Ban },
  DEMO_DATA: { className: "bg-cream text-muted", Icon: FlaskConical },
  ESTIMATE: { className: "bg-cream text-muted", Icon: Info },
  SANDBOX: { className: "bg-warning-soft text-warning-ink", Icon: FlaskConical },
  UNAVAILABLE: { className: "bg-cream text-faint", Icon: Ban },
};

export function StatusBadge({ status, className, label, size = "md" }: { status: Status; className?: string; label?: string; size?: "sm" | "md" }) {
  const t = useTranslations("Status");
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
      {label ?? t(status)}
    </span>
  );
}

/** Compliance result with icon + word + colour. */
export function ComplianceBadge({ status, className }: { status: "COMPLIANT" | "ACTION_REQUIRED" | "BLOCKED"; className?: string }) {
  const t = useTranslations("ComplianceBadge");
  const label = status === "COMPLIANT" ? t("compliant") : status === "ACTION_REQUIRED" ? t("actionRequired") : t("blocked");
  return <StatusBadge status={status} label={label} className={className} />;
}
