import { useTranslations } from "next-intl";
import { useDateLocale } from "@/lib/i18n/date";
import type { RemittanceQuote } from "@/lib/types";
import { formatRate } from "@/lib/fx/service";
import { Money } from "./money";
import { StatusBadge } from "./status-badge";
import { cn, formatDateTime } from "@/lib/utils";
import type { ExplanationPart } from "@/lib/remittance/engine";
import { renderExplanation } from "@/lib/remittance/explain-i18n";

export interface QuotesView {
  quotes: RemittanceQuote[];
  delivery_quotes: RemittanceQuote[];
  best_provider_id: string | null;
  lowest_fee_provider_id: string | null;
  compare_amount: number;
  destination_amount: number | null;
  explanation: string;
  explanation_parts?: ExplanationPart[];
  advantage_vs: { provider_name: string; extra_recipient_amount: number; lower_total_cost: number }[];
  fx_as_of: string;
  fx_source: string;
}

/** The full technical comparison, shown when someone expands "See full comparison". */
export function QuotesTable({ view }: { view: QuotesView }) {
  const t = useTranslations("QuotesTable");
  const dl = useDateLocale();
  const te = useTranslations("Explain");
  const src = view.quotes[0]?.source_currency;
  const dst = view.quotes[0]?.destination_currency;
  return (
    <div>
      <div role="region" aria-label={t("tableLabel")} tabIndex={0} className="cm-scroll-x overflow-x-auto rounded-[18px] bg-cream">
        <table className="w-full min-w-[720px] text-left text-[13.5px]">
          <thead>
            <tr className="text-[12.5px] text-muted">
              <th className="px-4 py-3 font-medium">{t("provider")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("fxRate")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("fxSpread")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("fee")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("totalCost")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("recipientGets")}</th>
              <th className="px-4 py-3 font-medium">{t("settlement")}</th>
            </tr>
          </thead>
          <tbody>
            {view.quotes.map((q) => {
              const best = q.provider_id === view.best_provider_id;
              const deliver = view.delivery_quotes.find((d) => d.provider_id === q.provider_id);
              return (
                <tr key={q.id} className={cn("border-t border-white", best && "bg-gold-soft", !q.available && "text-muted")}>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5 font-bold text-cocoa">
                      {q.provider_name}
                      {best && <StatusBadge status="BEST_VALUE" size="sm" />}
                    </div>
                    {deliver && view.destination_amount ? (
                      <div className="mt-0.5 text-[12.5px] text-muted">
                        {t.rich("sendToDeliver", {
                          send: () => <Money amount={deliver.source_amount} currency={deliver.source_currency} />,
                          deliver: () => <Money amount={view.destination_amount!} currency={deliver.destination_currency} />,
                        })}
                      </div>
                    ) : null}
                    {q.unavailable_reason ? <div className="mt-0.5 text-[12.5px]">{q.unavailable_reason}</div> : null}
                  </td>
                  <td className="num px-3 py-3 text-right align-top font-mono text-[13px]">{formatRate(q.provider_fx_rate)}</td>
                  <td className="num px-3 py-3 text-right align-top">{(q.fx_spread_pct * 100).toFixed(2)}%</td>
                  <td className="px-3 py-3 text-right align-top"><Money amount={q.transfer_fee + q.other_charges} currency={q.source_currency} /></td>
                  <td className="px-3 py-3 text-right align-top"><Money amount={q.total_cost} currency={q.source_currency} /></td>
                  <td className={cn("px-3 py-3 text-right align-top", best && "font-extrabold text-brand")}><Money amount={q.estimated_recipient_amount} currency={q.destination_currency} /></td>
                  <td className="px-4 py-3 align-top text-muted">{q.settlement_time}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted">
        {t.rich("footnote", {
          dst: dst ?? "",
          source: view.fx_source,
          asOf: formatDateTime(view.fx_as_of, dl),
          amount: () => <Money amount={view.compare_amount} currency={src} />,
          rate: () => <span className="font-mono">{view.quotes[0] ? formatRate(view.quotes[0].market_fx_rate) : ""}</span>,
        })}
      </p>
      <p className="mt-2 text-[13.5px] leading-6 text-cocoa-2">{renderExplanation(view.explanation_parts, te, view.explanation)}</p>
    </div>
  );
}
