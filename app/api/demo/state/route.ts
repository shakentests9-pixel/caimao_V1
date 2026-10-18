import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { dataMode } from "@/lib/config";
import { DEMO_COOKIE, verifyDemoSession } from "@/lib/auth/demo-session";
import { exportDemoSnapshot } from "@/lib/data/memory";

export const dynamic = "force-dynamic";

/**
 * Demo mode only: the mutable demo state, read by the page-rendering function so pages show what
 * the /api function changed (Vercel runs them as separate processes). Requires the demo session;
 * it never exists in Supabase mode.
 */
export async function GET() {
  if (dataMode() !== "memory") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const userId = await verifyDemoSession((await cookies()).get(DEMO_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return NextResponse.json(exportDemoSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
