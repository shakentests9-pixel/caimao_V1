"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslations } from "next-intl";
import type { Currency, TransactionCategory } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { CATEGORY } from "./caimao/category";

/** Donut of spending by category. Colours come from the shared category map. */
export function SpendingDonut({ data, currency, total, height = 220, label, compact }: { data: { category: string; amount: number }[]; currency: Currency; total: number; height?: number; label?: string; compact?: boolean }) {
  const t = useTranslations("SpendingDonut");
  const tcat = useTranslations("Categories");
  const rows = data.filter((d) => d.amount > 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="amount" nameKey="category" innerRadius="70%" outerRadius="100%" paddingAngle={2.5} cornerRadius={6} stroke="none" isAnimationActive={false}>
            {rows.map((d) => (
              <Cell key={d.category} fill={CATEGORY[d.category as TransactionCategory]?.color ?? "#E9D8C8"} />
            ))}
          </Pie>
          <Tooltip formatter={(v, name) => [formatMoney(Number(v), currency), name != null && name in CATEGORY ? tcat(String(name)) : name]} contentStyle={{ borderRadius: 14, border: "none", fontSize: 13, color: "#3A2117", boxShadow: "0 14px 32px rgba(58,33,23,0.14)" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[12.5px] font-semibold text-muted">{label ?? t("spent")}</span>
        {compact ? (
          <span className="num font-display text-[17px] font-extrabold leading-tight text-cocoa">
            <span className="block text-[11px] font-medium text-muted">{currency}</span>
            {Math.round(total).toLocaleString("en-GB")}
          </span>
        ) : (
          <span className="num font-display text-[19px] font-extrabold tracking-[-0.03em] text-cocoa">{formatMoney(total, currency)}</span>
        )}
      </div>
    </div>
  );
}
