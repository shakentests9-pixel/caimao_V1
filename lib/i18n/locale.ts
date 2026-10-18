import { LOCALES, type Locale } from "../types";

export const LOCALE_COOKIE = "CAIMAO_LOCALE";
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  "zh-CN": { native: "简体中文", english: "Simplified Chinese" },
  ja: { native: "日本語", english: "Japanese" },
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function resolveLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** BCP-47 tag used for dates. Money keeps CaiMao's "GBP 1,234.00" format in every language. */
export const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", "zh-CN": "zh-CN", ja: "ja-JP" };

/** Name of the language for the model's system prompt. */
export const MODEL_LANGUAGE: Record<Locale, string> = { en: "English", "zh-CN": "Simplified Chinese (简体中文)", ja: "Japanese (日本語)" };
