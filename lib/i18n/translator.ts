import { createTranslator } from "use-intl/core";
import en from "../../messages/en.json";
import zhCN from "../../messages/zh-CN.json";
import ja from "../../messages/ja.json";
import type { Locale } from "../types";
import { resolveLocale } from "./locale";

/**
 * Translator for code that runs outside React (the agent's built-in planner, server text).
 * Same catalogues as the UI; any missing string falls back to English.
 */
type Tree = { [k: string]: string | Tree };
const merge = (base: Tree, over: Tree): Tree => {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = typeof v === "object" && typeof base[k] === "object" ? merge(base[k] as Tree, v as Tree) : v;
  return out;
};

const CATALOGUES: Record<Locale, Tree> = {
  en: en as Tree,
  "zh-CN": merge(en as Tree, zhCN as Tree),
  ja: merge(en as Tree, ja as Tree),
};

export function serverTranslator(locale: unknown, namespace?: string) {
  const l = resolveLocale(locale);
  return createTranslator({ locale: l, messages: CATALOGUES[l] as never, namespace: namespace as never, onError: () => {} }) as unknown as AnyT;
}

/** Loosely-typed translator: keys are checked by the catalogue tests instead. */
export type AnyT = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };
