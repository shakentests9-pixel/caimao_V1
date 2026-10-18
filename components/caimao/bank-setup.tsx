"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistItem as Item, CountryCode } from "@/lib/types";
import { CountryChip } from "../country-chip";
import { ChecklistCard } from "./checklist-card";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/** Countries named in a short form in the title (countryShort.*). */
const SHORT: CountryCode[] = ["GB", "US"];

/** Onboarding-style task list for opening a local bank account. Informational only. */
export function BankSetupChecklist({ items, initialCountry }: { items: Item[]; initialCountry: CountryCode }) {
  const router = useRouter();
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [local, setLocal] = useState(items);
  const [pending, start] = useTransition();
  const t = useTranslations("BankSetup");
  const tc = useTranslations("Countries");
  const countries = [...new Set(items.map((i) => i.country))];
  const list = local.filter((i) => i.country === country);

  function toggle(id: string, completed: boolean) {
    setLocal((l) => l.map((i) => (i.id === id ? { ...i, completed } : i)));
    start(async () => {
      await fetch(`/api/checklist/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed }) });
      router.refresh();
    });
  }

  return (
    <ChecklistCard
      numbered
      progress
      title={t("title", { country: SHORT.includes(country) ? t(`countryShort.${country}`) : tc(country) })}
      items={list.map((i) => ({
        id: i.id,
        label: i.label,
        detail: i.detail,
        state: i.completed ? "done" : "todo",
        action: i.completed ? (
          <button onClick={() => toggle(i.id, false)} disabled={pending} className="flex min-h-11 items-center rounded-full px-3 text-[14px] font-extrabold text-success-ink hover:bg-success-soft" aria-label={t("readyUndo", { label: i.label })}>
            {t("ready")}
          </button>
        ) : (
          <button onClick={() => toggle(i.id, true)} disabled={pending} className="cm-press min-h-11 rounded-full bg-brand-soft px-4 text-[14px] font-extrabold text-brand hover:bg-peach-soft">
            {t("markDone")}
          </button>
        ),
      }))}
    >
      <div className="cm-scroll-x -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("country")}>
        {countries.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === country}
            onClick={() => setCountry(c)}
            className={cn("cm-press flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-[14px] font-bold transition-colors", c === country ? "bg-cocoa text-white" : "bg-cream text-cocoa-2 hover:bg-sand")}
          >
            <CountryChip code={c} size={30} />
            {tc(c)}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{t("progress", { done: list.filter((i) => i.completed).length, total: list.length })}</p>
      <p className="mb-2 text-[13px] text-muted">{t("disclaimer")}</p>
    </ChecklistCard>
  );
}
