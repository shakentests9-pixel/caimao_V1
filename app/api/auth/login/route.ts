import { NextResponse } from "next/server";
import { z } from "zod";
import { dataMode } from "@/lib/config";
import { createUserClient } from "@/lib/supabase/server";

const Body = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

export async function POST(req: Request) {
  if (dataMode() !== "supabase") return NextResponse.json({ error: "Supabase is not configured." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter an email and a password of at least 8 characters." }, { status: 400 });
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
