import { NextResponse } from "next/server";
import { z } from "zod";
import { dataMode } from "@/lib/config";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locale";
import { cookies } from "next/headers";

const Body = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

export async function POST(req: Request) {
  if (dataMode() !== "supabase") return NextResponse.json({ error: "Supabase is not configured." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter an email and a password of at least 8 characters." }, { status: 400 });
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return NextResponse.json({ error: "Email or password is incorrect.", code: "BAD_CREDENTIALS" }, { status: 401 });
  // A language picked on the sign-in screen carries over to the profile.
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen) && data.user) await createAdminClient().from("profiles").update({ language: chosen }).eq("id", data.user.id);
  return NextResponse.json({ ok: true });
}
