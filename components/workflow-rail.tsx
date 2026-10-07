import { Check, X } from "lucide-react";
import { PHASES, type Phase } from "@/lib/agent/protocol";
import { cn } from "@/lib/utils";

export type PhaseState = "pending" | "active" | "done" | "stopped";

/**
 * The agent's journey: Understand → Analyse → Check compliance → Compare →
 * Recommend → Obtain approval → Execute → Verify. Green ticks for done, a gold
 * halo for the current step, sand for what's ahead.
 */
export function AgentProgress({ states, className, compact }: { states: Partial<Record<Phase, PhaseState>>; className?: string; compact?: boolean }) {
  const doneCount = PHASES.filter((p) => states[p] === "done").length;
  const stopped = PHASES.find((p) => states[p] === "stopped");
  const active = PHASES.find((p) => states[p] === "active");
  const current = stopped ?? active ?? (doneCount === PHASES.length ? "Verify" : PHASES[doneCount]);

  return (
    <div className={className}>
      {/* Mobile: one line of text plus a bar. */}
      <div className={cn("md:hidden", compact === false && "hidden")}>
        <div className="flex items-baseline justify-between text-[13px]">
          <span className={cn("font-bold", stopped ? "text-error-ink" : "text-cocoa")}>
            {stopped ? `Stopped at ${stopped.toLowerCase()}` : doneCount === PHASES.length ? "All steps complete" : current}
          </span>
          <span className="num text-muted">
            {doneCount}/{PHASES.length}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", stopped ? "bg-error" : "cm-accent")}
            style={{ width: `${(doneCount / PHASES.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Tablet/desktop: eight evenly spaced steps, labels under the dots. */}
      <ol className={cn("hidden grid-cols-8 md:grid", compact === false && "grid")} aria-label="CaiMao's progress">
        {PHASES.map((p, i) => {
          const s = states[p] ?? "pending";
          const next = PHASES[i + 1];
          const nextState = next ? states[next] ?? "pending" : null;
          return (
            <li key={p} className="relative flex flex-col items-center text-center" aria-current={s === "active" ? "step" : undefined}>
              {next && (
                <span className="absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-[11px] h-[3px] overflow-hidden rounded-full bg-sand" aria-hidden>
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out", nextState === "stopped" ? "bg-error" : "cm-accent")}
                    style={{ width: s === "done" && nextState !== "pending" ? "100%" : s === "done" ? "50%" : "0%" }}
                  />
                </span>
              )}
              <span
                className={cn(
                  "relative flex size-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300",
                  s === "done" && "bg-success-ink text-white",
                  s === "active" && "animate-glow bg-gold text-cocoa",
                  s === "pending" && "bg-sand text-cocoa-2",
                  s === "stopped" && "bg-error-ink text-white",
                )}
              >
                {s === "done" ? <Check className="size-3.5" strokeWidth={3} /> : s === "stopped" ? <X className="size-3.5" strokeWidth={3} /> : <span className="num">{i + 1}</span>}
              </span>
              <span className={cn("mt-1.5 px-1 text-[12.5px] leading-tight transition-colors", s === "pending" ? "font-semibold text-muted" : s === "stopped" ? "font-bold text-error-ink" : s === "active" ? "font-extrabold text-brand" : "font-bold text-success-ink")}>
                {p}
                <span className="sr-only">{s === "done" ? " (done)" : s === "active" ? " (in progress)" : s === "stopped" ? " (stopped)" : " (not started)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Kept for existing imports. */
export const WorkflowRail = AgentProgress;
