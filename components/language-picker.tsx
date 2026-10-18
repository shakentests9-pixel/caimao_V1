"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, Languages, Loader2 } from "lucide-react";
import { LOCALES, type Locale } from "@/lib/types";
import { LOCALE_LABELS } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

/**
 * Language choice. Saves to the profile when signed in (and a cookie for signed-out screens),
 * then re-renders the page in the new language. Names are shown in their own language.
 */
export function LanguagePicker({ variant = "full", className }: { variant?: "full" | "compact"; className?: string }) {
  const t = useTranslations("Language");
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, start] = useTransition();

  const choose = (locale: Locale) =>
    start(async () => {
      if (locale === current) return;
      await fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }) });
      router.refresh();
    });

  if (variant === "compact") {
    return (
      <div role="group" aria-label={t("label")} className={cn("flex items-center gap-1 rounded-[14px] bg-white p-1 shadow-card", className)}>
        <Languages className="ml-1.5 size-4 text-muted" aria-hidden />
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            onClick={() => choose(l)}
            aria-pressed={l === current}
            disabled={pending}
            className={cn("min-h-9 rounded-[10px] px-2.5 text-[13px] font-bold transition-colors", l === current ? "bg-cocoa text-white" : "text-cocoa-2 hover:bg-cream")}
          >
            {LOCALE_LABELS[l].native}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label={t("label")} className={cn("grid gap-2 sm:grid-cols-3", className)}>
      {LOCALES.map((l) => {
        const active = l === current;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            lang={l}
            onClick={() => choose(l)}
            disabled={pending}
            className={cn(
              "cm-press flex min-h-[56px] items-center justify-between gap-3 rounded-[18px] border-2 px-4 text-left",
              active ? "border-brand bg-brand-soft" : "border-transparent bg-cream hover:border-brand-line",
            )}
          >
            <span>
              <span className="block text-[16px] font-extrabold text-cocoa">{LOCALE_LABELS[l].native}</span>
              <span className="block text-[12.5px] text-muted" lang="en">{LOCALE_LABELS[l].english}</span>
            </span>
            {pending && !active ? null : active ? <Check className="size-5 text-brand" aria-hidden /> : null}
            {pending && active ? <Loader2 className="size-4 animate-spin text-brand" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
