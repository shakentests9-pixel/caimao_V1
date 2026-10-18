import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, isLocale, resolveLocale } from "@/lib/i18n/locale";
import { getRepositoryOrNull } from "@/lib/session";

/**
 * Locale for each request, without locale-prefixed URLs.
 *  - The CAIMAO_LOCALE cookie, which every language change (picker, settings, assistant) updates.
 *  - Otherwise, when signed in, the language saved on the profile (a new device follows the
 *    user's choice; sign-in also writes the cookie).
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  let locale = resolveLocale(fromCookie);
  if (!isLocale(fromCookie)) {
    try {
      const repo = await getRepositoryOrNull();
      if (repo) locale = resolveLocale((await repo.getProfile()).language);
    } catch {
      /* default language */
    }
  }
  const english = (await import("../messages/en.json")).default;
  // Any string not yet translated falls back to English instead of showing a raw key.
  const messages = locale === "en" ? english : deepMerge(english, (await import(`../messages/${locale}.json`)).default);
  return { locale, messages, timeZone: "UTC" };
});

type Tree = { [k: string]: string | Tree };
function deepMerge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = typeof v === "object" && typeof base[k] === "object" ? deepMerge(base[k] as Tree, v) : v;
  }
  return out;
}
