import type { AccountRequirements, BankProduct, CountryRule, CreditSystemInfo, Locale } from "../types";

/**
 * Overlay the reviewed translation of descriptive reference text for display.
 * Only text fields are replaced; every flag, number, URL, date and name used by the
 * eligibility and rules engines stays exactly as researched. English is the fallback.
 */
function overlay<T extends { i18n?: unknown }>(row: T, locale: Locale): T {
  const out = { ...row, i18n: undefined };
  if (locale === "en" || !row.i18n) return out;
  const tr = (row.i18n as Partial<Record<Locale, Partial<T>>>)[locale];
  if (!tr) return out;
  for (const [k, v] of Object.entries(tr)) {
    if (v == null) continue;
    const orig = (row as Record<string, unknown>)[k];
    // Arrays must line up item-for-item with the English, otherwise keep the original.
    if (Array.isArray(orig) && (!Array.isArray(v) || v.length !== orig.length)) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export const localizeBank = (b: BankProduct, l: Locale) => overlay(b, l);
export const localizeRequirements = (r: AccountRequirements, l: Locale) => overlay(r, l);
export const localizeCredit = (c: CreditSystemInfo, l: Locale) => overlay(c, l);

/** Rule display text: the translated name/summary when one exists. */
export function localizeRuleText(r: CountryRule, l: Locale): { name: string; summary: string; translated: boolean } {
  const tr = l !== "en" ? r.i18n?.[l] : null;
  return { name: tr?.name ?? r.rule_name, summary: tr?.summary ?? r.rule_description, translated: !!tr || l === "en" };
}
