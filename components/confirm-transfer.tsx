"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, CircleX, Loader2, Lock, ShieldCheck } from "lucide-react";
import type { TransferRequest } from "@/lib/types";
import { COUNTRY_NAMES } from "@/lib/types";
import type { ExecutionOutcome } from "@/lib/finance";
import { formatMoney, formatRate } from "@/lib/fx/service";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { StatusBadge } from "./status-badge";
import { PermissionChip } from "./permission-chip";
import { CompliancePanel } from "./compliance-panel";
import { ChecklistCard, type ChecklistItem } from "./caimao/checklist-card";
import { TransferSummaryCard } from "./caimao/transfer-summary-card";
import { SuccessState } from "./caimao/success-state";
import { cn, formatDate } from "@/lib/utils";

export interface ConfirmTarget {
  request: TransferRequest;
  provider_name: string;
  account_label: string;
  obligation_title: string | null;
}

type Stage =
  | { kind: "requirements" }
  | { kind: "review" }
  | { kind: "executing"; step: number }
  | { kind: "done"; execution: ExecutionOutcome }
  | { kind: "error"; message: string; code?: string };

const EXEC_STEPS = ["Recording your approval", "Sending the payment", "Updating your balance", "Saving the receipt"];

/** Friendly names for the documents the rules ask for. The original name stays in the detail line. */
const DOC_LABEL: Record<string, [ready: string, needed: string]> = {
  "Passport or national ID": ["Identity verified", "Identity document needed"],
  "University invoice": ["Tuition invoice ready", "Tuition invoice needed"],
  "Source-of-funds declaration": ["Source of funds ready", "Source-of-funds declaration needed"],
  "Confirmation of enrolment (CAS)": ["University reference ready", "University reference needed"],
  "Admission letter": ["Admission letter ready", "Admission letter needed"],
};

/** Requirements derived from the compliance result stored on the transfer request. */
function requirementItems(r: TransferRequest): ChecklistItem[] {
  const snap = r.compliance_snapshot;
  const docs: ChecklistItem[] = r.required_documents.map((d) => ({
    id: `doc-${d.name}`,
    label: DOC_LABEL[d.name]?.[d.on_file ? 0 : 1] ?? `${d.name}${d.on_file ? " ready" : " needed"}`,
    detail: d.name,
    state: d.on_file ? "done" : "todo",
    stateLabel: d.on_file ? "Ready" : "Needed",
  }));
  const limits: ChecklistItem[] = snap.evaluations
    .filter((e) => e.rule.enforcement === "block_above")
    .map((e) => ({
      id: `rule-${e.rule.id}`,
      label: e.outcome === "BLOCK" ? "Over the transfer limit" : "Within the transfer limit",
      detail: e.message,
      state: e.outcome === "BLOCK" ? "blocked" : "done",
      stateLabel: e.outcome === "BLOCK" ? "Blocked" : "OK",
    }));
  return [...docs, ...limits];
}

/**
 * The Level 3 gate, in three steps: transfer requirements, review, confirm.
 * Money moves only after the account holder ticks the review box and presses
 * Confirm & Pay; the server checks the same approval again.
 */
export function ConfirmTransferDialog({
  target,
  open,
  onOpenChange,
  correlationId,
  onCompleted,
  onDeclined,
}: {
  target: ConfirmTarget | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  correlationId?: string | null;
  onCompleted?: (e: ExecutionOutcome) => void;
  onDeclined?: () => void;
}) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "requirements" });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (open) {
      setAck(false);
      setRulesOpen(false);
      setStage({ kind: "requirements" });
    }
  }, [open, target?.request.id]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (stage.kind !== "executing") return;
    const t = setTimeout(() => setStage((s) => (s.kind === "executing" && s.step < EXEC_STEPS.length - 1 ? { kind: "executing", step: s.step + 1 } : s)), 380);
    return () => clearTimeout(t);
  }, [stage]);

  if (!target) return null;
  const r = target.request;
  const snap = r.compliance_snapshot;
  const secondsLeft = Math.max(0, Math.min(15 * 60, Math.floor((new Date(r.expires_at).getTime() - now) / 1000)));
  const expired = secondsLeft === 0;
  const awaiting = r.status === "PENDING_APPROVAL";
  const isTuition = /tuition/i.test(target.obligation_title ?? r.purpose);
  const items = requirementItems(r);
  const ready = r.compliance_status === "COMPLIANT";
  const arrival = formatDate(r.estimated_settlement_date, { weekday: "short", day: "numeric", month: "short" });

  async function confirm() {
    setStage({ kind: "executing", step: 0 });
    try {
      const res = await fetch(`/api/transfers/${r.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true, correlation_id: correlationId ?? null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStage({ kind: "error", message: body.error ?? "The transfer could not be completed.", code: body.code });
        router.refresh();
        return;
      }
      setStage({ kind: "done", execution: body.execution });
      onCompleted?.(body.execution);
      router.refresh();
    } catch {
      setStage({ kind: "error", message: "Network error. Check Activity & Security before trying again." });
    }
  }

  async function decline() {
    await fetch(`/api/transfers/${r.id}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correlation_id: correlationId ?? null }),
    }).catch(() => {});
    onDeclined?.();
    onOpenChange(false);
    router.refresh();
  }

  const header = (
    <div className="flex flex-wrap items-center gap-2 pr-12">
      <PermissionChip level={3} />
      <StatusBadge status="SANDBOX" size="sm" label="Sandbox" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => stage.kind !== "executing" && onOpenChange(o)}>
      <DialogContent hideClose={stage.kind === "executing"}>
        {stage.kind === "done" ? (
          <SuccessState execution={stage.execution} isTuition={isTuition} arrival={formatDate(r.estimated_settlement_date, { day: "numeric", month: "short" })} onDone={() => onOpenChange(false)} Title={DialogTitle} Description={DialogDescription} />
        ) : stage.kind === "requirements" ? (
          /* Step 1: transfer requirements */
          <div className="p-6 sm:p-7">
            {header}
            <p className="mt-5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
              {COUNTRY_NAMES[snap.source_country]} → {COUNTRY_NAMES[snap.destination_country]}
            </p>
            <DialogTitle className="mt-1.5 font-display text-[28px] font-extrabold tracking-[-0.05em] text-cocoa">Ready to send?</DialogTitle>
            <DialogDescription className="mt-1 text-[15px] text-muted">Purpose: {isTuition ? "University tuition" : r.purpose}</DialogDescription>

            <div className={cn("mt-5 rounded-[20px] p-4", ready ? "bg-success-soft" : snap.status === "BLOCKED" ? "bg-error-soft" : "bg-warning-soft")}>
              <p className={cn("font-display text-[18px] font-extrabold", ready ? "text-success-ink" : snap.status === "BLOCKED" ? "text-error-ink" : "text-warning-ink")}>
                {ready ? "Transfer requirements checked" : snap.status === "BLOCKED" ? "This transfer can't go ahead" : "A few things are needed first"}
              </p>
              <p className="mt-0.5 text-[14px] text-cocoa-2">
                {ready ? "Everything needed for this payment is in place." : "Sort these out, then ask CaiMao to prepare it again."}
              </p>
            </div>

            <ChecklistCard bare className="mt-4" items={items} />

            <button onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-brand hover:underline">
              {rulesOpen ? "Hide the rules" : `See all ${snap.evaluations.length} rules checked`}
              <ChevronDown className={cn("size-4 transition-transform", rulesOpen && "rotate-180")} />
            </button>
            {rulesOpen ? <div className="mt-2 animate-rise"><CompliancePanel result={snap} /></div> : null}

            <button
              onClick={() => setStage({ kind: "review" })}
              disabled={!ready || !awaiting || expired}
              className="cm-press cm-cta mt-6 flex h-[54px] w-full items-center justify-center rounded-[16px] text-[16px] font-extrabold disabled:opacity-45"
            >
              Review transfer
            </button>
            {awaiting && !expired ? (
              <button onClick={decline} className="mt-2 flex h-12 w-full items-center justify-center rounded-[16px] text-[15px] font-bold text-cocoa-2 hover:bg-cream">
                Cancel transfer
              </button>
            ) : (
              <p className="mt-3 text-center text-[14px] text-muted">{expired && awaiting ? "This rate has expired. Ask CaiMao to prepare the transfer again." : "This transfer can no longer be confirmed."}</p>
            )}
          </div>
        ) : (
          /* Step 2: review and confirm */
          <div className="p-6 sm:p-7">
            {header}
            <button
              onClick={() => setStage({ kind: "requirements" })}
              disabled={stage.kind === "executing"}
              className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-full text-[14px] font-bold text-brand hover:underline disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> Requirements
            </button>
            <DialogTitle className="mt-1 font-display text-[28px] font-extrabold tracking-[-0.05em] text-cocoa">Review your transfer</DialogTitle>
            <DialogDescription className="mt-1 text-[15px] text-muted">CaiMao prepared this. Nothing has been sent yet.</DialogDescription>

            <TransferSummaryCard
              className="mt-5"
              send={{ amount: r.source_amount, currency: r.source_currency }}
              receive={{ amount: r.destination_amount, currency: r.destination_currency }}
              from={snap.source_country}
              to={r.recipient_country}
              receiveLabel={`${r.recipient.replace(" Treasury", "")} receives`}
            />

            <dl className="mt-4 divide-y divide-line">
              {(
                [
                  ["Recipient", <span key="to">{r.recipient}{r.invoice_ref ? <span className="block text-[13px] font-medium text-muted">{r.invoice_ref}</span> : null}</span>],
                  ["From", target.account_label.replace("****", "•••• ")],
                  ["Provider", target.provider_name],
                  ["Fee", formatMoney(r.transfer_fee, r.source_currency)],
                  ["Exchange rate", <span key="fx" className="font-mono text-[14px]">1 {r.source_currency} = {formatRate(r.provider_fx_rate)} {r.destination_currency}<span className="block font-sans text-[12.5px] font-medium text-muted">Mid-market {formatRate(r.market_fx_rate)}</span></span>],
                  ["Arrival", arrival],
                  ["Requirements", <span key="c" className={cn("inline-flex items-center gap-1.5", ready ? "text-success-ink" : "text-error-ink")}><CheckCircle2 className="size-4" /> {ready ? "Checked" : "Not met"}</span>],
                  [
                    "Documents",
                    <span key="d" className="inline-flex items-center gap-1.5 text-success-ink" title={r.required_documents.map((d) => d.name).join(", ")}>
                      <CheckCircle2 className="size-4" /> Complete{r.required_documents.length ? ` (${r.required_documents.length})` : ""}
                    </span>,
                  ],
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 py-3 text-[14.5px]">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="text-right font-bold text-cocoa">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              {stage.kind === "error" ? (
                <div className="mb-4 flex items-start gap-2 rounded-[16px] bg-error-soft px-4 py-3 text-[14px] text-error-ink" role="alert">
                  <CircleX className="mt-0.5 size-[18px] shrink-0" />
                  <div>
                    <div className="font-extrabold">Payment {stage.code === "PAYMENT_FAILED" ? "failed" : "not sent"}</div>
                    <div>{stage.message}</div>
                  </div>
                </div>
              ) : null}

              {stage.kind === "executing" ? (
                <ul className="space-y-2.5 rounded-[20px] bg-cream p-4" aria-live="polite">
                  {EXEC_STEPS.map((s, i) => (
                    <li key={s} className="flex items-center gap-2.5 text-[14.5px] font-semibold">
                      {i < stage.step ? <CheckCircle2 className="size-5 text-success-ink" /> : i === stage.step ? <Loader2 className="size-5 animate-spin text-brand" /> : <span className="size-5 rounded-full border-2 border-sand" />}
                      <span className={i <= stage.step ? "text-cocoa" : "text-muted"}>{s}</span>
                    </li>
                  ))}
                </ul>
              ) : awaiting && !expired && stage.kind !== "error" ? (
                <>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[16px] bg-ivory px-4 py-3 text-[15px] font-bold text-cocoa ring-1 ring-line">
                    <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} aria-label="I reviewed this transfer" />
                    I reviewed this transfer
                  </label>
                  <button onClick={confirm} disabled={!ack} className="cm-press cm-cta mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-[16px] text-[16px] font-extrabold disabled:opacity-45">
                    <Lock className="size-[18px]" /> Confirm &amp; Pay
                  </button>
                  <button onClick={decline} className="cm-press mt-2 flex h-12 w-full items-center justify-center rounded-[16px] bg-cream text-[15px] font-extrabold text-cocoa hover:bg-sand">
                    Cancel
                  </button>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                    <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Payments always need your approval.</span>
                    <span className="num">Rate held for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3 text-[14px] text-muted">
                  <span>{expired && awaiting ? "This rate has expired. Ask CaiMao to prepare the transfer again." : "This transfer can no longer be confirmed."}</span>
                  <button onClick={() => onOpenChange(false)} className="min-h-11 rounded-[14px] bg-cream px-4 font-bold text-cocoa">Close</button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
