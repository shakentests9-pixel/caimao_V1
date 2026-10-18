import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/audit";
import { COUNTRY_CODES, COUNTRY_CURRENCY, type CountryCode, CURRENCIES, LOCALES, RESIDENCY_STATUSES, STUDENT_STATUSES, VISA_TYPES } from "@/lib/types";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

// Level 3 cannot be granted as a standing permission: every execution needs its own approval.
const Body = z.object({
  base_currency: z.enum(CURRENCIES).optional(),
  ai_permission_level: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  documents_on_file: z.array(z.string().max(80)).max(20).optional(),
  // Cross-border profile. null clears a value ("I'd rather not say" → CaiMao will ask again when needed).
  nationality: z.enum(COUNTRY_CODES).nullable().optional(),
  home_country: z.enum(COUNTRY_CODES).optional(),
  study_country: z.enum(COUNTRY_CODES).optional(),
  visa_type: z.enum(VISA_TYPES as [string, ...string[]]).nullable().optional(),
  residency_status: z.enum(RESIDENCY_STATUSES as [string, ...string[]]).nullable().optional(),
  student_status: z.enum(STUDENT_STATUSES as [string, ...string[]]).nullable().optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  tax_residency: z.enum(COUNTRY_CODES).nullable().optional(),
  language: z.enum(LOCALES).optional(),
});

export async function POST(req: Request) {
  try {
    const repo = await getRepository();
    const patch: Record<string, unknown> = Body.parse(await req.json());
    // Keep currencies consistent with the countries they belong to.
    if (patch.home_country) patch.home_currency = COUNTRY_CURRENCY[patch.home_country as CountryCode];
    if (patch.study_country) patch.study_currency = COUNTRY_CURRENCY[patch.study_country as CountryCode];
    const profile = await repo.updateProfile(patch as Parameters<typeof repo.updateProfile>[0]);
    // Never log personal details in full: record which fields changed, not their values (except non-personal settings).
    const personal = ["nationality", "visa_type", "residency_status", "age", "tax_residency"];
    const details = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, personal.includes(k) ? "updated" : v]));
    await audit({ repo, actor: "user", correlationId: null }, "SETTINGS_CHANGED", { level: 0, details });
    const res = NextResponse.json({ profile });
    if (typeof patch.language === "string") res.cookies.set(LOCALE_COOKIE, patch.language, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
