"use client";
import { ChevronDown } from "lucide-react";
import { CURRENCIES, type Currency } from "@/lib/types";
import { CurrencyChip } from "../country-chip";

/** Currency pill with a round country chip. A native select underneath keeps it accessible on every device. */
export function CurrencySelector({ value, onChange, label }: { value: Currency; onChange: (c: Currency) => void; label: string }) {
  return (
    <label className="cm-press relative inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-[16px] bg-cream pl-1.5 pr-9 transition-colors hover:bg-sand">
      <CurrencyChip currency={value} size={36} />
      <span className="font-display text-[17px] font-extrabold text-cocoa">{value}</span>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Currency)} className="absolute inset-0 cursor-pointer opacity-0">
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
