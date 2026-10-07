import { Ban, Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChecklistState = "done" | "todo" | "blocked" | "info";

export interface ChecklistItem {
  id: string;
  label: string;
  detail?: React.ReactNode;
  state: ChecklistState;
  /** Short status word shown on the right, e.g. "Ready", "Needed". */
  stateLabel?: string;
  action?: React.ReactNode;
}

const STATE_TEXT: Record<ChecklistState, string> = { done: "done", todo: "to do", blocked: "blocked", info: "for information" };

/**
 * Checklist rows with friendly states. Used for transfer requirements, local bank
 * setup and the credit journey. Every state pairs an icon and a word with its colour.
 */
export function ChecklistCard({
  items,
  numbered,
  title,
  subtitle,
  progress,
  className,
  children,
  bare,
}: {
  items: ChecklistItem[];
  numbered?: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  progress?: boolean;
  className?: string;
  children?: React.ReactNode;
  bare?: boolean;
}) {
  const done = items.filter((i) => i.state === "done").length;
  const countable = items.filter((i) => i.state !== "info").length;
  const pct = countable ? done / countable : 0;
  return (
    <div className={cn(!bare && "rounded-[24px] bg-white p-5 shadow-card sm:p-6", className)}>
      {title || progress ? (
        <div className="mb-4 flex items-center gap-4">
          {progress ? (
            <svg viewBox="0 0 48 48" className="size-14 shrink-0 -rotate-90" role="img" aria-label={`${done} of ${countable} ready`}>
              <circle cx="24" cy="24" r="20" fill="none" stroke="#F1E6DE" strokeWidth="5" />
              <circle cx="24" cy="24" r="20" fill="none" stroke="#A84A1A" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${pct * 125.66} 125.66`} className="transition-[stroke-dasharray] duration-500" />
            </svg>
          ) : null}
          <div className="min-w-0">
            {title ? <h3 className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-cocoa">{title}</h3> : null}
            {subtitle ?? (progress ? <p className="num text-[14.5px] text-muted">{done} of {countable} ready</p> : null)}
          </div>
        </div>
      ) : null}
      {children}
      <ol className="divide-y divide-line">
        {items.map((i, n) => (
          <li key={i.id} className="flex items-center gap-3.5 py-3.5 first:pt-1 last:pb-1">
            <span
              className={cn(
                "num flex size-9 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-extrabold",
                i.state === "done" && "bg-success-soft text-success-ink",
                i.state === "todo" && "bg-cream text-muted",
                i.state === "blocked" && "bg-error-soft text-error-ink",
                i.state === "info" && "bg-cream text-cocoa-2",
              )}
            >
              {i.state === "done" ? <Check className="size-[18px]" strokeWidth={3} /> : i.state === "blocked" ? <Ban className="size-[18px]" /> : i.state === "info" ? <Info className="size-[18px]" /> : numbered ? String(n + 1).padStart(2, "0") : <span className="size-2 rounded-full bg-sand" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3.5">
            <div className="min-w-0 self-stretch sm:flex-1 sm:self-auto">
              <div className={cn("text-[15px] font-bold", i.state === "blocked" ? "text-error-ink" : "text-cocoa")}>
                {i.label}
                <span className="sr-only"> ({STATE_TEXT[i.state]})</span>
              </div>
              {i.detail ? <div className="text-[13.5px] leading-5 text-muted">{i.detail}</div> : null}
            </div>
            {i.action ? <div className="shrink-0">{i.action}</div> : null}
            </div>
            {!i.action && i.stateLabel ? (
              <span className={cn("shrink-0 text-[13.5px] font-extrabold", i.state === "done" ? "text-success-ink" : i.state === "blocked" ? "text-error-ink" : i.state === "todo" ? "text-brand" : "text-muted")}>{i.stateLabel}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
