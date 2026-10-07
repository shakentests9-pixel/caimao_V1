import type { Currency, FxRate } from "../types";

/**
 * The single place FX conversion happens. Every module converts through an
 * FxService instance, so replacing seeded rates with a live feed only means
 * implementing FxRateSource.
 */
export interface FxRateSource {
  getRates(): Promise<FxRate[]>;
}

export class FxService {
  private readonly perUsd: Map<Currency, number>;
  readonly asOf: string;
  readonly source: string;

  constructor(rates: FxRate[]) {
    if (!rates.length) throw new Error("FX rates unavailable");
    this.perUsd = new Map(rates.map((r) => [r.quote, Number(r.rate)]));
    this.perUsd.set("USD", 1);
    this.asOf = rates[0].as_of;
    this.source = rates[0].source;
  }

  static async from(source: FxRateSource) {
    return new FxService(await source.getRates());
  }

  /** Mid-market rate: units of `to` received for 1 unit of `from`. */
  rate(from: Currency, to: Currency): number {
    if (from === to) return 1;
    const f = this.perUsd.get(from);
    const t = this.perUsd.get(to);
    if (!f || !t) throw new Error(`No FX rate for ${from}/${to}`);
    return t / f;
  }

  convert(amount: number, from: Currency, to: Currency): number {
    return amount * this.rate(from, to);
  }

  supports(c: string): c is Currency {
    return this.perUsd.has(c as Currency);
  }
}

export const CURRENCY_DECIMALS: Record<Currency, number> = { USD: 2, GBP: 2, SGD: 2, CNY: 2, HKD: 2, VND: 0 };
export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: "US$", GBP: "£", SGD: "S$", CNY: "¥", HKD: "HK$", VND: "₫" };

export function roundMoney(amount: number, currency: Currency): number {
  const f = 10 ** CURRENCY_DECIMALS[currency];
  return Math.round(amount * f) / f;
}

/** Round up, used when a recipient must receive at least an exact amount. */
export function ceilMoney(amount: number, currency: Currency): number {
  const f = 10 ** CURRENCY_DECIMALS[currency];
  return Math.ceil(amount * f - 1e-9) / f;
}

export function formatMoney(amount: number, currency: Currency, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const decimals = CURRENCY_DECIMALS[currency];
  const abs = Math.abs(amount);
  const body = opts.compact && abs >= 100000
    ? new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(abs)
    : new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(abs);
  const sign = amount < 0 ? "−" : opts.sign && amount > 0 ? "+" : "";
  return `${sign}${currency} ${body}`;
}

export function formatRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toFixed(6);
}
