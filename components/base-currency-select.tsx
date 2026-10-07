"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { CURRENCIES, type Currency } from "@/lib/types";
import { CurrencyChip } from "./country-chip";

export function BaseCurrencySelect({ value }: { value: Currency }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="relative inline-flex h-11 items-center gap-2 rounded-[15px] bg-white pl-1.5 pr-3 shadow-card">
      <CurrencyChip currency={value} size={32} />
      <span className="sr-only">Show balances in</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_currency: e.target.value }) });
            router.refresh();
          })
        }
        className="appearance-none bg-transparent pr-5 text-[14px] font-extrabold text-cocoa outline-none"
      >
        {CURRENCIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted" />
    </label>
  );
}
