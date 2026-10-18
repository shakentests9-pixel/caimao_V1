"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, LogOut } from "lucide-react";
import { CURRENCIES, PermissionLevel, type Currency } from "@/lib/types";
import type { SeedScenario } from "@/lib/seed";
import { Checkbox } from "./ui/checkbox";
import { PERMISSION_COPY } from "./permission-chip";
import { CurrencyChip } from "./country-chip";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

async function save(patch: Record<string, unknown>) {
  const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error((await res.json()).error);
}

export function CurrencyPreference({ base }: { base: Currency }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = useTranslations("SettingsForms");
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("showBalancesIn")}>
      {CURRENCIES.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={c === base}
          disabled={pending}
          onClick={() => start(async () => { await save({ base_currency: c }); router.refresh(); })}
          className={cn("cm-press flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-[14.5px] font-bold transition-colors", c === base ? "bg-cocoa text-white" : "bg-cream text-cocoa-2 hover:bg-sand")}
        >
          <CurrencyChip currency={c} size={32} />
          {c}
        </button>
      ))}
    </div>
  );
}

export function PermissionForm({ level }: { level: PermissionLevel }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const levels = [PermissionLevel.Information, PermissionLevel.Read, PermissionLevel.Prepare];
  const t = useTranslations("SettingsForms");
  const tp = useTranslations("Permissions");
  return (
    <div className="space-y-3" role="radiogroup" aria-label={t("permissionsLabel")}>
      {levels.map((lvl) => {
        const c = PERMISSION_COPY[lvl];
        const on = lvl === level;
        return (
          <button
            key={lvl}
            role="radio"
            aria-checked={on}
            disabled={pending}
            onClick={() => start(async () => { await save({ ai_permission_level: lvl }); router.refresh(); })}
            className={cn("cm-press flex w-full items-center gap-4 rounded-[18px] border-2 p-4 text-left transition-colors", on ? "border-brand bg-brand-soft" : "border-sand bg-white hover:bg-ivory")}
          >
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px]", on ? "bg-brand text-white" : "bg-cream text-cocoa-2")}>
              <c.Icon className="size-5" />
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-2 text-[16px] font-extrabold text-cocoa">
                {tp(`level${lvl}.name`)}
                {lvl === PermissionLevel.Prepare && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[12px] font-extrabold text-gold-ink">{t("recommended")}</span>}
              </span>
              <span className="block text-[14px] leading-5 text-muted">{tp(`level${lvl}.text`)}</span>
            </span>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", on ? "border-brand bg-brand text-white" : "border-sand")} aria-hidden>
              {on && <Check className="size-3.5" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
      <div className="flex items-center gap-4 rounded-[18px] bg-cocoa p-4 text-white">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-white/10">
          <Lock className="size-5" />
        </span>
        <span>
          <span className="block text-[16px] font-extrabold">{t("approvalTitle")}</span>
          <span className="block text-[14px] text-cream">{t("approvalText")}</span>
        </span>
      </div>
    </div>
  );
}

const ALL_DOCS = ["Passport or national ID", "University invoice", "Confirmation of enrolment (CAS)", "Source-of-funds declaration", "Admission letter"];
/** Message keys for the document names; the stored values above stay in English. */
const DOC_KEYS: Record<string, string> = {
  "Passport or national ID": "passport",
  "University invoice": "universityInvoice",
  "Confirmation of enrolment (CAS)": "cas",
  "Source-of-funds declaration": "sourceOfFunds",
  "Admission letter": "admissionLetter",
};

export function DocumentsForm({ onFile }: { onFile: string[] }) {
  const router = useRouter();
  const [docs, setDocs] = useState(onFile);
  const [pending, start] = useTransition();
  const t = useTranslations("SettingsForms");
  return (
    <ul className="space-y-2">
      {ALL_DOCS.map((d) => {
        const on = docs.includes(d);
        return (
          <li key={d}>
            <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[16px] bg-cream px-4 py-3">
              <Checkbox
                checked={on}
                disabled={pending}
                onCheckedChange={(v) => {
                  const next = v === true ? [...docs, d] : docs.filter((x) => x !== d);
                  setDocs(next);
                  start(async () => { await save({ documents_on_file: next }); router.refresh(); });
                }}
              />
              <span className="flex-1 text-[15px] font-semibold text-cocoa">{t(`documents.${DOC_KEYS[d]}`)}</span>
              <span className={cn("text-[13px] font-extrabold", on ? "text-success-ink" : "text-muted")}>{on ? t("ready") : t("notAdded")}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function ScenarioForm({ scenarios, current }: { scenarios: SeedScenario[]; current: SeedScenario["id"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const t = useTranslations("SettingsForms");
  return (
    <ul className="space-y-2">
      {scenarios.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-cream px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-extrabold text-cocoa">
              {s.label}
              {s.id === current && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-extrabold text-success-ink">{t("loaded")}</span>}
            </div>
            <div className="text-[13.5px] text-muted">{s.description}</div>
          </div>
          <button
            disabled={busy !== null}
            onClick={async () => {
              setBusy(s.id);
              await fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: s.id }) });
              try { sessionStorage.removeItem("caimao.copilot.v1"); } catch {}
              setBusy(null);
              router.push("/");
              router.refresh();
            }}
            className={cn("cm-press inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-4 text-[14px] font-extrabold", s.id === "standard" ? "cm-cta" : "bg-white text-cocoa shadow-card")}
          >
            {busy === s.id ? <Loader2 className="size-4 animate-spin" /> : null}
            {s.id === "standard" ? t("resetDemo") : t("load")}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const t = useTranslations("SettingsForms");
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className={cn("cm-press inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-white px-5 text-[15px] font-extrabold text-error-ink shadow-card hover:bg-error-soft", className)}
    >
      <LogOut className="size-[18px]" /> {t("signOut")}
    </button>
  );
}
