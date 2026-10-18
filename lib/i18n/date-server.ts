import { getLocale } from "next-intl/server";
import { DATE_LOCALE, resolveLocale } from "./locale";

/** BCP-47 tag for dates in the current language (async server components). */
export async function getDateLocale(): Promise<string> {
  return DATE_LOCALE[resolveLocale(await getLocale())];
}
