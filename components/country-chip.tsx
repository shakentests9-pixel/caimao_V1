import type { CountryCode, Currency } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Passport-stamp style chip: a round badge with a country or currency code.
 * Used instead of flag emoji, which don't render on every platform.
 */
const COUNTRY_STYLE: Record<CountryCode, string> = {
  SG: "bg-[#ffe3e3] text-[#b42727]",
  GB: "bg-[#e3ecff] text-[#1f3f99]",
  US: "bg-[#e8eaf6] text-[#283593]",
  CN: "bg-[#ffe9dc] text-[#a33a00]",
  HK: "bg-[#ffe4ec] text-[#a3164a]",
  VN: "bg-[#fff2cc] text-[#8a5a00]",
};

export const CURRENCY_COUNTRY: Record<Currency, CountryCode> = { SGD: "SG", GBP: "GB", USD: "US", CNY: "CN", HKD: "HK", VND: "VN" };

export function CountryChip({ code, size = 40, className, ring }: { code: CountryCode; size?: number; className?: string; ring?: boolean }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold", COUNTRY_STYLE[code], ring && "ring-[3px] ring-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.32) }}
      aria-hidden
    >
      {code}
    </span>
  );
}

export function CurrencyChip({ currency, size = 40, className, ring }: { currency: Currency; size?: number; className?: string; ring?: boolean }) {
  return <CountryChip code={CURRENCY_COUNTRY[currency]} size={size} className={className} ring={ring} />;
}

/** Two chips joined by a dotted route, e.g. SG ┈ GB. */
export function RoutePair({ from, to, size = 28 }: { from: CountryCode; to: CountryCode; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`${from} to ${to}`}>
      <CountryChip code={from} size={size} />
      <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden className="text-faint">
        <path d="M1 4h26" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 3" strokeLinecap="round" />
      </svg>
      <CountryChip code={to} size={size} />
    </span>
  );
}
