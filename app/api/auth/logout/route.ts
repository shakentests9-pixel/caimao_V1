import { NextResponse } from "next/server";
import { dataMode } from "@/lib/config";
import { DEMO_COOKIE } from "@/lib/auth/demo-session";
import { createUserClient } from "@/lib/supabase/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  if (dataMode() === "supabase") await (await createUserClient()).auth.signOut();
  else res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
