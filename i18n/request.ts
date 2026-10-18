import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/i18n/locale";

/**
 * Locale for each request, without locale-prefixed URLs: the CAIMAO_LOCALE cookie is set
 * whenever the user picks a language (Settings, onboarding) and mirrors profile.language.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages, timeZone: "UTC" };
});
