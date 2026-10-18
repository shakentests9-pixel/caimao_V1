"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Currency } from "@/lib/types";
import { CURRENCY_DECIMALS, formatMoney } from "@/lib/fx/service";
import { useAnimatedNumber } from "../animated-number";

const HIDE_KEY = "caimao.hideBalance";

/**
 * Total balance on the premium cocoa-to-orange surface with the gold ring motif.
 * Below it, one tile per currency held. The amount can be hidden; the choice is remembered.
 */
export function HeroBalanceCard({
  total,
  currency,
  accountCount,
  holdings,
}: {
  total: number;
  currency: Currency;
  accountCount: number;
  holdings: { currency: Currency; amount: number; share: number }[];
}) {
  const t = useTranslations("HeroBalanceCard");
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    } catch {}
  }, []);
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? "0" : "1");
      } catch {}
      return !h;
    });
  const shown = useAnimatedNumber(total);
  const d = CURRENCY_DECIMALS[currency];
  const [whole, frac] = new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }).format(shown).split(".");

  return (
    <section className="cm-premium cm-ring relative isolate flex h-full flex-col overflow-hidden rounded-[28px] p-6 shadow-float sm:p-7" aria-label={t("totalBalance")}>
      <div className="cm-dots pointer-events-none absolute inset-0 -z-10 opacity-50 [mask-image:linear-gradient(110deg,transparent_35%,black_80%)]" aria-hidden />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold text-cream">{t("totalBalance")}</p>
          <p className="mt-2 flex items-baseline gap-2 font-display">
            <span className="text-[18px] font-bold text-cream/80">{currency}</span>
            <span className="num text-[42px] font-extrabold leading-none tracking-[-0.05em] sm:text-[54px]">
              {hidden ? "••••••" : whole}
              {!hidden && frac ? <span className="text-[0.5em] text-cream/75">.{frac}</span> : null}
            </span>
          </p>
          <p className="mt-2 text-[14px] text-cream/85">{t("across", { count: accountCount })}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="cm-press flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-white/10 text-white hover:bg-white/20"
          aria-label={hidden ? t("showBalance") : t("hideBalance")}
          aria-pressed={hidden}
        >
          {hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>

      <ul className="mt-auto grid grid-cols-3 gap-2 pt-7">
        {holdings.map((h) => (
          <li key={h.currency} className="rounded-[14px] bg-white/10 px-3 py-2.5">
            <div className="flex items-center justify-between text-[12px] font-bold text-cream/85">
              {h.currency}
              <span className="num font-semibold text-cream/70">{Math.round(h.share * 100)}%</span>
            </div>
            <div className="num mt-0.5 truncate text-[14.5px] font-extrabold">{hidden ? "••••" : formatMoney(h.amount, h.currency).split(" ")[1]}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
