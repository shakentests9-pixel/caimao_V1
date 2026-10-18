"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Lock } from "lucide-react";
import {
  COUNTRY_CODES,
  RESIDENCY_STATUSES,
  STUDENT_STATUSES,
  SUPPORTED_COUNTRIES,
  VISA_TYPES,
  type CountryCode,
  type Profile,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Fields = Pick<Profile, "nationality" | "home_country" | "study_country" | "age" | "student_status" | "visa_type" | "residency_status" | "tax_residency">;

/**
 * The details eligibility and transfer rules depend on. Every field can be left blank:
 * CaiMao then asks before giving definitive guidance instead of assuming.
 */
export function CrossBorderProfileForm({ initial, compact, onSaved }: { initial: Fields; compact?: boolean; onSaved?: () => void }) {
  const t = useTranslations("ProfileForm");
  const tc = useTranslations("Countries");
  const router = useRouter();
  const [v, setV] = useState<Fields>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Fields>(k: K, value: Fields[K]) => {
    setSaved(false);
    setV((p) => ({ ...p, [k]: value }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
      if (!res.ok) return setError(t("error"));
      setSaved(true);
      onSaved?.();
      router.refresh();
    });
  };

  const select = (id: keyof Fields, options: readonly string[], label: string, render: (o: string) => string, allowBlank = true) => (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-cocoa-2">{label}</span>
      <select
        id={`pf-${id}`}
        value={(v[id] as string | null) ?? ""}
        onChange={(e) => set(id, (e.target.value || null) as never)}
        className="h-12 w-full rounded-[14px] border border-line bg-white px-3 text-[15px] font-semibold text-cocoa outline-none focus:border-brand"
      >
        {allowBlank ? <option value="">{t("notSet")}</option> : null}
        {options.map((o) => (
          <option key={o} value={o}>
            {render(o)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-2")}>
        {select("nationality", COUNTRY_CODES, t("nationality"), (c) => tc(c))}
        {select("home_country", COUNTRY_CODES, t("currentCountry"), (c) => tc(c), false)}
        {select("study_country", SUPPORTED_COUNTRIES, t("studyCountry"), (c) => tc(c), false)}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-bold text-cocoa-2">{t("age")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={13}
            max={120}
            value={v.age ?? ""}
            onChange={(e) => set("age", e.target.value ? Math.max(13, Math.min(120, Number(e.target.value))) : null)}
            placeholder={t("notSet")}
            className="h-12 w-full rounded-[14px] border border-line bg-white px-3 text-[15px] font-semibold text-cocoa outline-none focus:border-brand"
          />
        </label>
        {select("student_status", STUDENT_STATUSES, t("studentStatus"), (o) => t(`studentStatuses.${o}`))}
        {select("visa_type", VISA_TYPES, t("visaType"), (o) => t(`visaTypes.${o}`))}
        {select("residency_status", RESIDENCY_STATUSES, t("residency"), (o) => t(`residencies.${o}`))}
        {select("tax_residency", COUNTRY_CODES as readonly CountryCode[], t("taxResidency"), (c) => tc(c))}
      </div>
      <p className="flex items-start gap-2 text-[13px] leading-5 text-muted">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("privacy")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="cm-press cm-cta inline-flex h-12 items-center gap-2 rounded-[16px] px-5 text-[15px] font-extrabold disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} {t("save")}
        </button>
        {saved ? <span className="text-[14px] font-bold text-success-ink" role="status">{t("saved")}</span> : null}
        {error ? <span className="text-[14px] font-bold text-error-ink" role="alert">{error}</span> : null}
      </div>
    </form>
  );
}
