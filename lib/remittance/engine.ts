import { randomUUID } from "node:crypto";
import type { Currency, RemittanceProvider, RemittanceQuote } from "../types";
import { ceilMoney, formatMoney, roundMoney, type FxService } from "../fx/service";

/**
 * Mock remittance engine. Quotes are deterministic functions of the central
 * FX service and each provider's pricing, so the comparison is reproducible.
 *
 * Total cost = transfer fee + FX spread cost + other charges (all in the source currency).
 * Ranking uses the amount the recipient actually receives, never the advertised fee.
 */

export interface QuoteInput {
  source_currency: Currency;
  destination_currency: Currency;
  source_amount: number;
}

export function quoteForSourceAmount(provider: RemittanceProvider, input: QuoteInput, fx: FxService, now = new Date()): RemittanceQuote {
  const { source_currency: src, destination_currency: dst, source_amount } = input;
  const market = fx.rate(src, dst);
  const providerRate = market * (1 - provider.fx_margin);
  const fixedFee = fx.convert(provider.fixed_fee, provider.fee_currency, src);
  const fee = roundMoney(fixedFee + provider.pct_fee * source_amount, src);
  const other = roundMoney(fx.convert(provider.other_charges, provider.fee_currency, src), src);
  const convertible = Math.max(0, source_amount - fee - other);
  const recipient = roundMoney(convertible * providerRate, dst);
  const spreadCost = roundMoney(convertible * provider.fx_margin, src);
  const totalCost = roundMoney(fee + spreadCost + other, src);
  const limitInSource = fx.convert(provider.max_single_transfer, provider.max_currency, src);
  const available = source_amount <= limitInSource + 1e-6;

  return {
    id: randomUUID(),
    provider_id: provider.id,
    provider_name: provider.name,
    source_currency: src,
    destination_currency: dst,
    source_amount: roundMoney(source_amount, src),
    market_fx_rate: market,
    provider_fx_rate: providerRate,
    fx_spread_pct: provider.fx_margin,
    transfer_fee: fee,
    other_charges: other,
    fx_spread_cost: spreadCost,
    total_cost: totalCost,
    total_cost_destination: roundMoney(source_amount * market - recipient, dst),
    estimated_recipient_amount: recipient,
    settlement_time: provider.settlement_label,
    settlement_business_days: provider.settlement_business_days,
    is_estimate: true,
    available,
    unavailable_reason: available
      ? null
      : `Exceeds ${provider.name}'s single-transfer limit of ${formatMoney(provider.max_single_transfer, provider.max_currency)}`,
    created_at: now.toISOString(),
  };
}

/** Smallest send amount (to the cent) for which the recipient receives at least `destination_amount`. */
export function quoteForDestinationAmount(
  provider: RemittanceProvider,
  input: { source_currency: Currency; destination_currency: Currency; destination_amount: number },
  fx: FxService,
  now = new Date(),
): RemittanceQuote {
  const { source_currency: src, destination_currency: dst, destination_amount } = input;
  const providerRate = fx.rate(src, dst) * (1 - provider.fx_margin);
  const fixed = fx.convert(provider.fixed_fee + provider.other_charges, provider.fee_currency, src);
  let source = ceilMoney((destination_amount / providerRate + fixed) / (1 - provider.pct_fee), src);
  let q = quoteForSourceAmount(provider, { source_currency: src, destination_currency: dst, source_amount: source }, fx, now);
  const step = 1 / 10 ** (src === "VND" ? 0 : 2);
  for (let i = 0; q.estimated_recipient_amount < destination_amount && i < 50; i++) {
    source = roundMoney(source + step, src);
    q = quoteForSourceAmount(provider, { source_currency: src, destination_currency: dst, source_amount: source }, fx, now);
  }
  return q;
}

export interface QuoteComparison {
  quotes: RemittanceQuote[]; // sorted best first
  best: RemittanceQuote | null;
  lowest_advertised_fee: RemittanceQuote | null;
  worst: RemittanceQuote | null;
  /** Extra amount reaching the recipient with the best route vs. each other route. */
  advantage_vs: { provider_name: string; extra_recipient_amount: number; lower_total_cost: number }[];
  explanation: string;
}

/**
 * Rank by recipient amount (highest first). Ties go to the faster route.
 * A zero-fee provider gets no preference: its cost usually sits inside the FX rate.
 */
export function compareQuotes(quotes: RemittanceQuote[]): QuoteComparison {
  const usable = quotes.filter((q) => q.available);
  const sorted = [...usable].sort(
    (a, b) => b.estimated_recipient_amount - a.estimated_recipient_amount || a.settlement_business_days - b.settlement_business_days,
  );
  const ranked = [...sorted, ...quotes.filter((q) => !q.available)];
  const best = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;
  const lowestFee = [...usable].sort((a, b) => a.transfer_fee - b.transfer_fee || b.estimated_recipient_amount - a.estimated_recipient_amount)[0] ?? null;

  const advantage_vs = best
    ? sorted.slice(1).map((q) => ({
        provider_name: q.provider_name,
        extra_recipient_amount: roundMoney(best.estimated_recipient_amount - q.estimated_recipient_amount, best.destination_currency),
        lower_total_cost: roundMoney(q.total_cost - best.total_cost, best.source_currency),
      }))
    : [];

  return { quotes: ranked, best, lowest_advertised_fee: lowestFee, worst, advantage_vs, explanation: explain(best, worst, lowestFee) };
}

function explain(best: RemittanceQuote | null, worst: RemittanceQuote | null, lowestFee: RemittanceQuote | null): string {
  if (!best) return "No provider can take this transfer at the requested amount.";
  const dst = best.destination_currency;
  const parts: string[] = [];
  if (worst && worst.provider_id !== best.provider_id) {
    const extra = best.estimated_recipient_amount - worst.estimated_recipient_amount;
    parts.push(
      `${best.provider_name} results in approximately ${formatMoney(extra, dst)} more reaching the recipient than ${worst.provider_name} after accounting for FX spread and fees.`,
    );
  }
  if (lowestFee && lowestFee.provider_id !== best.provider_id) {
    const feeText = lowestFee.transfer_fee === 0 ? "charges no transfer fee" : `charges the lowest transfer fee (${formatMoney(lowestFee.transfer_fee, lowestFee.source_currency)})`;
    parts.push(
      `${lowestFee.provider_name} ${feeText}, but its exchange rate is ${(lowestFee.fx_spread_pct * 100).toFixed(2)}% below mid-market, which costs ${formatMoney(lowestFee.fx_spread_cost, lowestFee.source_currency)} on this amount.`,
    );
  }
  parts.push(
    `${best.provider_name}'s all-in cost is ${formatMoney(best.total_cost, best.source_currency)} (fee ${formatMoney(best.transfer_fee, best.source_currency)} + FX spread ${formatMoney(best.fx_spread_cost, best.source_currency)}${best.other_charges ? ` + other charges ${formatMoney(best.other_charges, best.source_currency)}` : ""}). These are estimates; the rate is fixed only when the transfer is executed.`,
  );
  return parts.join(" ");
}

/** Add business days (Mon–Fri). Zero days on a weekend rolls to Monday. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const isWeekend = () => d.getUTCDay() === 0 || d.getUTCDay() === 6;
  while (isWeekend()) d.setUTCDate(d.getUTCDate() + 1);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend()) added++;
  }
  return d;
}
