import Link from "next/link";
import { ArrowDown, Check, ChevronDown, Download, ShieldCheck } from "lucide-react";
import { getRepository } from "@/lib/session";
import type { AuditAction, AuditLog, PaymentExecution } from "@/lib/types";
import type { Phase } from "@/lib/agent/protocol";
import { PageHeader } from "@/components/page-header";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { PermissionChip } from "@/components/permission-chip";
import { CurrencyChip } from "@/components/country-chip";
import { AgentProgress, type PhaseState } from "@/components/workflow-rail";
import { ActivityTimeline } from "@/components/caimao/activity-timeline";
import { EmptyState } from "@/components/caimao/empty-state";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Activity & Security" };

const PHASE_OF: Partial<Record<AuditAction, Phase>> = {
  PROFILE_READ: "Understand",
  OBLIGATIONS_READ: "Understand",
  ACCOUNTS_READ: "Analyse",
  TRANSACTIONS_READ: "Analyse",
  FX_RATE_READ: "Analyse",
  TRANSFER_RULE_CHECK: "Check compliance",
  QUOTE_RETRIEVAL: "Compare",
  COST_CALCULATION: "Recommend",
  TRANSFER_PREPARED: "Obtain approval",
  TRANSFER_REJECTED: "Obtain approval",
  USER_APPROVAL: "Obtain approval",
  USER_DECLINED: "Obtain approval",
  TRANSFER_EXECUTED: "Execute",
  TRANSFER_FAILED: "Execute",
  BALANCE_UPDATED: "Verify",
  OBLIGATION_PAID: "Verify",
};

const FINANCIAL: AuditAction[] = [
  "TRANSFER_RULE_CHECK",
  "QUOTE_RETRIEVAL",
  "COST_CALCULATION",
  "TRANSFER_PREPARED",
  "TRANSFER_REJECTED",
  "USER_APPROVAL",
  "USER_DECLINED",
  "TRANSFER_EXECUTED",
  "TRANSFER_FAILED",
  "BALANCE_UPDATED",
  "OBLIGATION_PAID",
  "PERMISSION_DENIED",
];

function railFor(logs: AuditLog[]): Partial<Record<Phase, PhaseState>> {
  const s: Partial<Record<Phase, PhaseState>> = {};
  for (const l of [...logs].reverse()) {
    const p = PHASE_OF[l.action];
    if (!p) continue;
    if (l.result !== "SUCCESS" || l.action === "USER_DECLINED") s[p] = "stopped";
    else if (l.action === "TRANSFER_PREPARED") s[p] = s[p] === "done" ? "done" : "active";
    else s[p] = "done";
    if (p === "Recommend" && l.result === "SUCCESS") s.Compare = s.Compare ?? "done";
  }
  return s;
}

function detailValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? Object.values(x as object).join(" · ") : String(x))).join("; ");
  return JSON.stringify(v);
}


/** The latest payment, verified: transaction ID, status, amounts and route. */
function VerificationCard({ e }: { e: PaymentExecution }) {
  return (
    <section className="cm-premium cm-ring relative isolate overflow-hidden rounded-[28px] p-6 shadow-float sm:p-7" aria-label="Latest verified transfer">
      <div className="cm-dots pointer-events-none absolute inset-0 -z-10 opacity-40" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-gold-ink">Verified transfer</span>
          <div className="mt-3 font-mono text-[24px] font-semibold tracking-wide sm:text-[28px]">{e.transaction_id}</div>
        </div>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-success-soft px-3.5 text-[14px] font-extrabold text-success-ink">
          <Check className="size-4" strokeWidth={3} /> Payment completed
        </span>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <CurrencyChip currency={e.source_currency} size={36} />
          <Money amount={e.source_amount} currency={e.source_currency} className="text-[20px] font-extrabold" codeClassName="text-cream/80" />
        </div>
        <ArrowDown className="size-5 -rotate-90 text-gold" aria-hidden />
        <div className="flex items-center gap-3">
          <CurrencyChip currency={e.destination_currency} size={36} />
          <Money amount={e.destination_amount} currency={e.destination_currency} className="text-[20px] font-extrabold text-gold" codeClassName="text-cream/80" />
        </div>
      </div>
      <p className="mt-4 text-[14.5px] text-cream">
        To {e.recipient} via {e.provider} · {formatDateTime(e.timestamp)} · sandbox
      </p>
    </section>
  );
}

export default async function ActivityPage() {
  const repo = await getRepository();
  const [executions, audit, profile] = await Promise.all([repo.listExecutions(), repo.listAudit(), repo.getProfile()]);
  const firstName = profile.full_name.split(" ")[0];
  const latest = executions[0];
  const runId = latest ? audit.find((a) => a.action === "TRANSFER_EXECUTED" && a.details.transaction_id === latest.transaction_id)?.correlation_id : null;
  const timelineRun = runId ?? audit.find((a) => FINANCIAL.includes(a.action))?.correlation_id ?? null;
  const timeline = audit.filter((a) => a.correlation_id === timelineRun && FINANCIAL.includes(a.action) && a.action !== "QUOTE_RETRIEVAL").reverse();

  const visible = audit.filter((a) => FINANCIAL.includes(a.action));
  const groups = new Map<string, AuditLog[]>();
  for (const l of visible) {
    const key = l.correlation_id ?? `single-${l.id}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const runs = [...groups.entries()];
  const fullRun = (key: string) => audit.filter((a) => a.correlation_id === key);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity & Security"
        description="Every payment and every check CaiMao ran, in order. Nothing here can be edited or deleted."
        action={
          <a href="/api/evidence" className="cm-press inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-medium text-cocoa shadow-card hover:bg-cream">
            <Download className="size-[18px]" /> Export
          </a>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {latest ? (
            <VerificationCard e={latest} />
          ) : (
            <EmptyState title="No payments yet" body="When you approve a payment, its receipt and every check behind it appear here." action={{ href: "/copilot?q=Pay%20my%20tuition", label: "Pay tuition with CaiMao" }} />
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Payments", executions.length],
              ["Your approvals", audit.filter((a) => a.action === "USER_APPROVAL").length],
              ["Rule checks", audit.filter((a) => a.action === "TRANSFER_RULE_CHECK").length],
              ["Stopped", audit.filter((a) => a.result !== "SUCCESS").length],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-[20px] bg-white px-4 py-3.5 shadow-card">
                <div className="text-[13px] text-muted">{k}</div>
                <div className="num font-display text-[26px] font-extrabold text-cocoa">{v}</div>
              </div>
            ))}
          </div>

          <section className="rounded-[28px] bg-white p-6 shadow-card">
            <h2 className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-cocoa">How you stay in control</h2>
            <ul className="mt-4 space-y-4">
              {[
                ["Nothing moves without you", "CaiMao can prepare a payment, but only your confirmation sends it. The server checks that approval again."],
                ["Rules checked twice", "Transfer rules are checked when CaiMao recommends a route and again when it prepares the payment."],
                ["A record you can trust", "Each step is written to an append-only log with the tool used, its permission level and the result."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-[13px] font-semibold text-brand">{i + 1}</span>
                  <span>
                    <span className="block text-[15px] font-extrabold text-cocoa">{t}</span>
                    <span className="block text-[14px] leading-5 text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-[28px] bg-white p-6 shadow-card lg:col-span-5" aria-label="Timeline">
          <h2 className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-cocoa">{latest ? "How this payment happened" : "Latest activity"}</h2>
          <ActivityTimeline logs={timeline} firstName={firstName} />
        </section>
      </div>

      {/* Full technical record for reviewers and judges. */}
      <details className="group rounded-[28px] bg-white shadow-card">
        <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-3 rounded-[28px] px-6 py-4 hover:bg-cream/60 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-cream text-cocoa-2">
              <ShieldCheck className="size-5" />
            </span>
            <span>
              <span className="block text-[16px] font-extrabold text-cocoa">View technical audit log</span>
              <span className="block text-[13.5px] text-muted">{visible.length} financial events across {runs.length} workflow runs, with tools, permission levels and results</span>
            </span>
          </span>
          <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-6 px-4 pb-6 sm:px-6">
          {executions.length > 0 && (
            <div role="region" aria-label="Payment details" tabIndex={0} className="cm-scroll-x overflow-x-auto rounded-[18px] bg-cream">
              <table className="w-full min-w-[860px] text-left text-[13.5px]">
                <caption className="px-4 pt-3 text-left text-[13px] font-extrabold text-cocoa-2">Sandbox payment executions</caption>
                <thead>
                  <tr className="text-[12.5px] text-muted">
                    {["Transaction ID", "Status", "Timestamp", "Provider", "Sent", "Received", "Fee", "Recipient"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr key={e.id} className="border-t border-white">
                      <td className="px-4 py-2.5 font-mono font-semibold">{e.transaction_id}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={e.status} size="sm" /></td>
                      <td className="num px-4 py-2.5 text-muted">{formatDateTime(e.timestamp)}</td>
                      <td className="px-4 py-2.5">{e.provider}</td>
                      <td className="px-4 py-2.5"><Money amount={e.source_amount} currency={e.source_currency} /></td>
                      <td className="px-4 py-2.5"><Money amount={e.destination_amount} currency={e.destination_currency} /></td>
                      <td className="px-4 py-2.5"><Money amount={e.fee} currency={e.source_currency} /></td>
                      <td className="px-4 py-2.5">{e.recipient}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {runs.map(([key, logs]) => (
            <div key={key} className="rounded-[20px] ring-1 ring-line">
              <div className="space-y-3 border-b border-line px-4 py-3">
                <div className="text-[13.5px]">
                  <span className="font-mono font-extrabold text-cocoa">{key.startsWith("single-") ? "standalone" : key}</span>
                  <span className="ml-2 text-muted">
                    {formatDateTime(logs[logs.length - 1].timestamp)} – {formatDateTime(logs[0].timestamp)}
                  </span>
                </div>
                {!key.startsWith("single-") && <AgentProgress states={railFor(fullRun(key))} />}
              </div>
              <div role="region" aria-label="Technical audit log" tabIndex={0} className="cm-scroll-x overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-[12.5px]">
                  <thead>
                    <tr className="text-[12px] text-muted">
                      {["Timestamp", "Actor", "Action", "Tool", "Level", "Approval", "Result", "Details"].map((h) => (
                        <th key={h} className="px-4 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...logs].reverse().map((l) => (
                      <tr key={l.id} className={cn("border-t border-line align-top", l.result !== "SUCCESS" && "bg-error-soft/60", l.action === "USER_APPROVAL" && "bg-brand-soft/60")}>
                        <td className="num whitespace-nowrap px-4 py-2 text-muted">{formatDateTime(l.timestamp)}</td>
                        <td className="whitespace-nowrap px-4 py-2">{l.actor === "ai_agent" ? "AI agent" : l.actor === "user" ? "User" : "System"}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono font-medium text-cocoa">{l.action}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-cocoa-2">{l.tool ?? "—"}</td>
                        <td className="px-4 py-2"><PermissionChip level={l.permission_level} compact /></td>
                        <td className="whitespace-nowrap px-4 py-2 text-muted">{l.approval_status.replace("_", " ").toLowerCase()}</td>
                        <td className={cn("px-4 py-2 font-semibold", l.result === "SUCCESS" ? "text-success-ink" : "text-error-ink")}>{l.result}</td>
                        <td className="min-w-[300px] px-4 py-2 text-cocoa-2">
                          <dl className="space-y-0.5">
                            {Object.entries(l.details).slice(0, 8).map(([k, v]) => (
                              <div key={k} className="flex gap-1.5">
                                <dt className="shrink-0 text-muted">{k.replace(/_/g, " ")}:</dt>
                                <dd className="break-words">{detailValue(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="px-1 text-[13px] text-muted">
            Reads such as balance and profile lookups are logged too and included in the export. Audit entries are append-only in the database.
          </p>
        </div>
      </details>
    </div>
  );
}
