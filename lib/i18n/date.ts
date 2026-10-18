import { useLocale } from "next-intl";
import { DATE_LOCALE, resolveLocale } from "./locale";

/** BCP-47 tag for dates in the current language (client components and non-async server components). */
export function useDateLocale(): string {
  return DATE_LOCALE[resolveLocale(useLocale())];
}
