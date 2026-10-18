"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EyeOff, FileText, FileUp, Loader2, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MascotTile } from "@/components/brand";
import { cn } from "@/lib/utils";
import type { StatementTransaction, StatementUpload } from "@/lib/types";

export type UploadResult = { upload: StatementUpload; transactions: StatementTransaction[] };

const MAX = 5 * 1024 * 1024;

/**
 * Upload card. Explicit consent is required before anything is sent; the file goes to
 * CaiMao's server once, is parsed in memory and discarded.
 */
export function StatementUploadCard({ onUploaded, sharedDemo = false }: { onUploaded: (r: UploadResult) => void; sharedDemo?: boolean }) {
  const t = useTranslations("StatementPage");
  const te = useTranslations("Errors");
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX) return setError(te("TOO_LARGE"));
    if (!/\.(csv|pdf)$/i.test(f.name)) return setError(te("UNSUPPORTED_TYPE"));
    setFile(f);
  };

  async function send(f: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", f);
    body.set("consent", String(consent));
    try {
      const res = await fetch("/api/statements", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        const reason = data?.details?.reason ?? data?.code;
        return setError(te.has(reason) ? te(reason) : te("UNREADABLE"));
      }
      onUploaded(data as UploadResult);
    } catch {
      setError(te("NETWORK"));
    } finally {
      setBusy(false);
    }
  }

  async function useSample() {
    const res = await fetch("/samples/caimao-sample-statement.csv");
    const blob = await res.blob();
    const f = new File([blob], "caimao-sample-statement.csv", { type: "text/csv" });
    setFile(f);
    if (consent) await send(f);
  }

  if (busy) {
    return (
      <section className="flex flex-col items-center rounded-[28px] bg-white px-6 py-14 text-center shadow-card" aria-live="polite" aria-busy="true">
        <MascotTile size={72} className="animate-breathe" />
        <h2 className="mt-5 font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("reading")}</h2>
        <p className="mt-1.5 max-w-[40ch] text-[15px] text-muted">{t("readingHint")}</p>
        <Loader2 className="mt-5 size-6 animate-spin text-brand" aria-hidden />
      </section>
    );
  }

  return (
    <section className="rounded-[28px] bg-white p-5 shadow-card sm:p-7" aria-labelledby="upload-title">
      <h2 id="upload-title" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-cocoa">{t("uploadTitle")}</h2>
      <p className="mt-1 text-[15px] text-muted">{t("uploadHint")}</p>
      {sharedDemo ? (
        <p role="note" className="mt-4 flex items-start gap-2.5 rounded-[16px] border border-gold/40 bg-gold-soft px-4 py-3 text-[14px] leading-6 text-gold-ink">
          <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden />
          <span>{t("sharedDemo")}</span>
        </p>
      ) : null}

      <label
        htmlFor="statement-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed px-5 py-8 text-center transition-colors",
          drag ? "border-brand bg-brand-soft" : file ? "border-success bg-success-soft/50" : "border-brand-line bg-ivory hover:border-brand",
        )}
      >
        {file ? <FileText className="size-9 text-success-ink" aria-hidden /> : <UploadCloud className="size-9 text-brand" aria-hidden />}
        <span className="mt-3 text-[16px] font-extrabold text-cocoa">{file ? file.name : t("choose")}</span>
        <span className="mt-1 text-[13.5px] text-muted">{file ? t("fileReady", { kb: Math.max(1, Math.round(file.size / 1024)) }) : t("formats")}</span>
        <input
          ref={input}
          id="statement-file"
          type="file"
          accept=".csv,.pdf,text/csv,application/pdf"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>

      <ul className="mt-5 grid gap-2.5 text-[14px] text-cocoa-2 sm:grid-cols-3">
        {[
          { Icon: ShieldCheck, text: t("privacy.notStored") },
          { Icon: EyeOff, text: t("privacy.masked") },
          { Icon: Trash2, text: t("privacy.delete") },
        ].map(({ Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 rounded-[16px] bg-cream px-3.5 py-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[18px] border border-line p-4">
        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} aria-describedby="consent-text" className="mt-0.5" />
        <span id="consent-text" className="text-[14.5px] leading-6 text-cocoa">
          {t("consent")}
        </span>
      </label>

      {error ? (
        <p role="alert" className="mt-4 rounded-[14px] bg-error-soft px-4 py-3 text-[14px] font-semibold text-error-ink">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={!file || !consent}
          onClick={() => file && send(file)}
          className="cm-press cm-cta flex h-[54px] flex-1 items-center justify-center gap-2 rounded-[16px] text-[16px] font-extrabold disabled:opacity-45"
        >
          <FileUp className="size-5" aria-hidden /> {t("analyse")}
        </button>
        <button
          type="button"
          onClick={useSample}
          disabled={!consent}
          className="cm-press flex h-[54px] items-center justify-center rounded-[16px] bg-cream px-5 text-[15px] font-extrabold text-cocoa hover:bg-sand disabled:opacity-45"
        >
          {t("useSample")}
        </button>
      </div>
      {!consent ? <p className="mt-2 text-[13px] text-muted">{t("consentFirst")}</p> : null}
      <p className="mt-3 text-[12.5px] text-muted">{t("noCredentials")}</p>
    </section>
  );
}
