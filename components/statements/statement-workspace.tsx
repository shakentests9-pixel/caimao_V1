"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle2, FileText, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import type { StatementTransaction, StatementUpload } from "@/lib/types";
import type { StatementAnalysis } from "@/lib/statements/analyse";
import { SampleStatementPreview } from "./sample-statement-preview";
import { StatementUploadCard, type UploadResult } from "./statement-upload";
import { StatementReview, type RowChange } from "./statement-review";
import { StatementAnalysisView } from "./statement-analysis";
import { cn } from "@/lib/utils";

type State = { upload: StatementUpload; transactions: StatementTransaction[]; analysis: StatementAnalysis | null } | null;

/**
 * Upload → preview (review and correct) → confirm → analysis. Nothing is analysed or kept
 * as an analysis until the user confirms the preview; the user can delete everything at any time.
 */
export function StatementWorkspace({ initial, history, sharedDemo = false }: { initial: State; history: StatementUpload[]; sharedDemo?: boolean }) {
  const t = useTranslations("StatementPage");
  const te = useTranslations("Errors");
  const format = useFormatter();
  const router = useRouter();
  const [state, setState] = useState<State>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const applyChanges = (changes: RowChange[]) => {
    if (!state) return;
    // Optimistic update; the server records the change and refreshes the analysis if confirmed.
    setState({
      ...state,
      transactions: state.transactions.map((r) => {
        const c = changes.find((x) => x.id === r.id);
        if (!c) return r;
        return { ...r, ...(c.category ? { category: c.category, category_source: "user" as const, confidence: 1, needs_review: false } : {}), ...(typeof c.included === "boolean" ? { included: c.included } : {}) };
      }),
    });
    start(async () => {
      const res = await fetch(`/api/statements/${state.upload.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes }) });
      if (res.ok) {
        const d = await res.json();
        setState({ upload: d.upload, transactions: d.transactions, analysis: d.analysis });
      } else setError(te("SAVE_FAILED"));
    });
  };

  const confirm = () =>
    start(async () => {
      if (!state) return;
      setError(null);
      const res = await fetch(`/api/statements/${state.upload.id}/confirm`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) return setError(te.has(d.code) ? te(d.code) : te("UNREADABLE"));
      setState({ upload: d.upload, transactions: state.transactions, analysis: d.analysis });
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  const remove = (id: string) =>
    start(async () => {
      if (!window.confirm(t("deleteConfirm"))) return;
      const res = await fetch(`/api/statements/${id}`, { method: "DELETE" });
      if (!res.ok) return setError(te("SAVE_FAILED"));
      if (state?.upload.id === id) setState(null);
      router.refresh();
    });

  const open = (id: string) =>
    start(async () => {
      const res = await fetch(`/api/statements/${id}`);
      if (res.ok) {
        const d = await res.json();
        setState({ upload: d.upload, transactions: d.transactions, analysis: d.analysis });
      }
    });

  const fmtDate = (iso: string | null) => (iso ? format.dateTime(new Date(iso + "T12:00:00Z"), { day: "numeric", month: "short", year: "numeric" }) : "—");

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-[16px] bg-error-soft px-4 py-3 text-[14px] font-semibold text-error-ink">
          {error}
        </p>
      ) : null}

      {!state ? (
        <>
          <StatementUploadCard sharedDemo={sharedDemo} onUploaded={(r: UploadResult) => setState({ upload: r.upload, transactions: r.transactions, analysis: null })} />
          <SampleStatementPreview />
        </>
      ) : (
        <>
          {/* File header */}
          <section className="flex flex-wrap items-center gap-4 rounded-[24px] bg-white p-5 shadow-card">
            <span className={cn("flex size-12 items-center justify-center rounded-[16px]", state.upload.status === "CONFIRMED" ? "bg-success-soft text-success-ink" : "bg-gold-soft text-gold-ink")}>
              {state.upload.status === "CONFIRMED" ? <CheckCircle2 className="size-6" /> : <FileText className="size-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-extrabold text-cocoa">{state.upload.file_name}</div>
              <div className="text-[13.5px] text-muted">
                {t("fileMeta", {
                  type: state.upload.file_type.toUpperCase(),
                  count: state.upload.row_count,
                  from: fmtDate(state.upload.period_start),
                  to: fmtDate(state.upload.period_end),
                })}
                {state.upload.account_hint ? ` · ${t("account", { hint: state.upload.account_hint })}` : ""}
              </div>
              {/* On phones the status sits under the file details so the name keeps its width. */}
              <span className={cn("mt-1.5 inline-flex rounded-full px-3 py-1 text-[12.5px] font-bold sm:hidden", state.upload.status === "CONFIRMED" ? "bg-success-soft text-success-ink" : "bg-gold-soft text-gold-ink")}>
                {state.upload.status === "CONFIRMED" ? t("statusConfirmed") : t("statusPreview")}
              </span>
            </div>
            <span className={cn("hidden rounded-full px-3 py-1 text-[12.5px] font-bold sm:inline-flex", state.upload.status === "CONFIRMED" ? "bg-success-soft text-success-ink" : "bg-gold-soft text-gold-ink")}>
              {state.upload.status === "CONFIRMED" ? t("statusConfirmed") : t("statusPreview")}
            </span>
            <div className="flex w-full gap-2 sm:w-auto">
              <button onClick={() => setState(null)} className="min-h-11 flex-1 rounded-[14px] bg-cream px-4 text-[14px] font-bold text-cocoa hover:bg-sand sm:flex-none">
                {t("newUpload")}
              </button>
              <button onClick={() => remove(state.upload.id)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] px-4 text-[14px] font-bold text-error-ink hover:bg-error-soft sm:flex-none">
                <Trash2 className="size-4" /> {t("delete")}
              </button>
            </div>
          </section>

          {state.upload.status === "PREVIEW" ? (
            <section aria-labelledby="preview-title" className="rounded-[28px] bg-white p-5 shadow-card sm:p-6">
              <h2 id="preview-title" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("previewTitle")}</h2>
              <p className="mt-1 text-[15px] text-muted">{t("previewHint")}</p>
              {state.upload.warnings.length ? (
                <ul className="mt-3 space-y-1">
                  {state.upload.warnings.map((w) => {
                    const [code, value] = w.split(":");
                    return (
                      <li key={w} className="rounded-[12px] bg-warning-soft px-3 py-2 text-[13.5px] font-semibold text-warning-ink">
                        {t.has(`warnings.${code}`) ? t(`warnings.${code}`, { value: value ?? "" }) : w}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="mt-4">
                <StatementReview rows={state.transactions} onChange={applyChanges} disabled={pending} initialFilter="review" />
              </div>
              <div className="sticky bottom-[86px] z-10 mt-5 flex flex-col gap-2 rounded-[20px] bg-white/95 py-2 backdrop-blur sm:static sm:flex-row sm:bg-transparent sm:py-0">
                <button onClick={confirm} disabled={pending} className="cm-press cm-cta flex h-[54px] flex-1 items-center justify-center gap-2 rounded-[16px] text-[16px] font-extrabold disabled:opacity-60">
                  {pending ? <Loader2 className="size-5 animate-spin" /> : <ShieldCheck className="size-5" />} {t("confirm", { count: state.transactions.filter((r) => r.included).length })}
                </button>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">{t("confirmNote")}</p>
            </section>
          ) : state.analysis ? (
            <>
              <StatementAnalysisView analysis={state.analysis} onAsk={`/copilot?q=${encodeURIComponent(t("askPrompt"))}`} />
              <details className="group rounded-[24px] bg-white p-5 shadow-card">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-[19px] font-extrabold text-cocoa">
                  {t("reviewTitle")}
                  <span className="text-[13px] font-bold text-brand group-open:hidden">{t("show")}</span>
                </summary>
                <p className="mb-3 text-[13.5px] text-muted">{t("reviewAfterHint")}</p>
                <StatementReview rows={state.transactions} onChange={applyChanges} disabled={pending} />
              </details>
            </>
          ) : null}
        </>
      )}

      {history.filter((h) => h.id !== state?.upload.id).length ? (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="mb-3 px-1 font-display text-[19px] font-extrabold text-cocoa">{t("historyTitle")}</h2>
          <ul className="divide-y divide-line rounded-[24px] bg-white px-4 shadow-card">
            {history
              .filter((h) => h.id !== state?.upload.id)
              .map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                  <FileText className="size-5 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-cocoa">{h.file_name}</span>
                    <span className="block text-[12.5px] text-muted">
                      {fmtDate(h.period_start)} – {fmtDate(h.period_end)} · {h.status === "CONFIRMED" ? t("statusConfirmed") : t("statusPreview")}
                    </span>
                  </span>
                  <button onClick={() => open(h.id)} className="min-h-10 rounded-[12px] bg-cream px-3 text-[13.5px] font-bold text-cocoa hover:bg-sand">
                    {t("open")}
                  </button>
                  <button onClick={() => remove(h.id)} aria-label={t("deleteNamed", { name: h.file_name })} className="flex min-h-10 min-w-10 items-center justify-center rounded-[12px] text-error-ink hover:bg-error-soft">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
