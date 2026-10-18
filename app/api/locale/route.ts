import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepositoryOrNull } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/audit";
import { LOCALES } from "@/lib/types";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const Body = z.object({ locale: z.enum(LOCALES) });

/**
 * Sets the interface language. Works before sign-in (onboarding) via a cookie, and also saves
 * it to the profile when the user is signed in so it persists across devices.
 */
export async function POST(req: Request) {
  try {
    const { locale } = Body.parse(await req.json());
    const repo = await getRepositoryOrNull();
    if (repo) {
      const before = (await repo.getProfile()).language;
      if (before !== locale) {
        await repo.updateProfile({ language: locale });
        await audit({ repo, actor: "user", correlationId: null }, "SETTINGS_CHANGED", { level: 0, details: { language: { from: before, to: locale } } });
      }
    }
    const res = NextResponse.json({ locale, saved_to_profile: !!repo });
    res.cookies.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: false, secure: process.env.NODE_ENV === "production" });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
