"use client";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Money } from "@/components/money";
import { CategoryIcon } from "@/components/caimao/category";
import { cn } from "@/lib/utils";
import type { StatementTransaction, TransactionCategory } from "@/lib/types";

export const EDITABLE_CATEGORIES: TransactionCategory[] = [
  "Income", "Accommodation", "Food", "Transportation", "Education", "Entertainment", "Travel", "Subscriptions", "Shopping", "Healthcare", "Fees", "Transfers", "Other",
];

export type RowChange = { id: string; category?: TransactionCategory; included?: boolean };

/**
 * Transaction review: every extracted row with its category, confidence and an include toggle.
 * Low-confidence rows are flagged; the user can correct categories before (or after) confirming.
 */
export function StatementReview({
  rows,
  onChange,
  disabled,
  initialFilter = "all",
}: {
  rows: StatementTransaction[];
  onChange: (changes: RowChange[]) => void;
  disabled?: boolean;
  initialFilter?: "all" | "review";
}) {
  const t = useTranslations("StatementPage");
  const tc = useTranslations("Categories");
  const format = useFormatter();
  const review = rows.filter((r) => r.needs_review && r.included).length;
  const [filter, setFilter] = useState<"all" | "review">(review ? initialFilter : "all");
  const [limit, setLimit] = useState(40);
  const shown = useMemo(() => (filter === "review" ? rows.filter((r) => r.needs_review) : rows), [rows, filter]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t("review.filter")} className="inline-flex rounded-[16px] bg-[#F3E6DB] p-1">
          {(["all", "review"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={cn("min-h-10 rounded-[12px] px-3.5 text-[14px] font-bold", filter === k ? "bg-white text-cocoa shadow-card" : "text-cocoa-2")}
            >
              {k === "all" ? t("review.all", { count: rows.length }) : t("review.needsReview", { count: review })}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">{t("review.hint")}</p>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-white">
        {shown.slice(0, limit).map((r) => (
          <li key={r.id} className={cn("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center", !r.included && "opacity-55")}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <CategoryIcon category={r.category} merchant={r.merchant} size={40} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate text-[15px] font-bold text-cocoa">{r.merchant}</span>
                  {r.needs_review ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11.5px] font-bold text-warning-ink">
                      <AlertTriangle className="size-3" aria-hidden /> {t("review.check")}
                    </span>
                  ) : null}
                  {r.category_source === "ai" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-bold text-brand">
                      <Sparkles className="size-3" aria-hidden /> {t("review.aiSuggestion")}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-[12.5px] text-muted" title={r.description}>
                  {format.dateTime(new Date(r.date + "T12:00:00Z"), { day: "numeric", month: "short" })} · {r.description}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <Money amount={r.amount} currency={r.currency} sign className={cn("text-[15px] font-extrabold", r.amount > 0 ? "text-success-ink" : "text-cocoa")} />
              <span className="hidden w-12 text-right text-[12px] font-semibold text-muted sm:block" title={t("review.confidence")}>
                {Math.round(r.confidence * 100)}%
              </span>
              <label className="sr-only" htmlFor={`cat-${r.id}`}>
                {t("review.categoryFor", { merchant: r.merchant })}
              </label>
              <select
                id={`cat-${r.id}`}
                disabled={disabled}
                value={r.category}
                onChange={(e) => onChange([{ id: r.id, category: e.target.value as TransactionCategory }])}
                className="h-10 w-[150px] rounded-[12px] border border-line bg-ivory px-2 text-[13.5px] font-semibold text-cocoa outline-none focus:border-brand"
              >
                {EDITABLE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tc(c)}
                  </option>
                ))}
              </select>
              <label className="flex min-h-10 items-center gap-1.5 text-[12.5px] font-semibold text-cocoa-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[#A84A1A]"
                  checked={r.included}
                  disabled={disabled}
                  onChange={(e) => onChange([{ id: r.id, included: e.target.checked }])}
                />
                {t("review.include")}
              </label>
            </div>
          </li>
        ))}
      </ul>
      {shown.length > limit ? (
        <button onClick={() => setLimit((l) => l + 60)} className="mt-3 min-h-11 w-full rounded-[14px] bg-cream text-[14px] font-bold text-cocoa hover:bg-sand">
          {t("review.showMore", { count: shown.length - limit })}
        </button>
      ) : null}
    </div>
  );
}
