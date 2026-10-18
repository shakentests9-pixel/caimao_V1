import { NextResponse } from "next/server";
import { dataMode } from "@/lib/config";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/demo-session";
import { DEMO_USER_ID } from "@/lib/seed";
import { MemoryRepository } from "@/lib/data/memory";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locale";
import { cookies } from "next/headers";

/** Local demo mode only: signs in as the seeded demo user, Alex Tan. */
export async function POST(req: Request) {
  if (dataMode() !== "memory") return NextResponse.json({ error: "Demo sign-in is disabled when Supabase is configured." }, { status: 404 });
  const { value, maxAge } = await signDemoSession(DEMO_USER_ID);
  // A language picked during onboarding carries over to the profile.
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) await new MemoryRepository(DEMO_USER_ID).updateProfile({ language: chosen }).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge,
  });
  return res;
}
