import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { dataMode } from "./config";
import { DEMO_COOKIE, verifyDemoSession } from "./auth/demo-session";
import { MemoryRepository, importDemoSnapshot, type DemoSnapshot } from "./data/memory";
import { SupabaseRepository, seedSupabaseUser } from "./data/supabase";
import type { Repository } from "./data/repository";
import { createAdminClient, createUserClient } from "./supabase/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue.");
  }
}

/**
 * Demo mode on Vercel: pages and /api routes run in separate functions with separate memory.
 * Every change happens in the /api function, so before a page renders we pull the current demo
 * state from it. Once per request (React cache); skipped for /api requests, locally and in
 * Supabase mode. On any failure the page renders from its own copy rather than failing.
 */
const syncDemoStateForPage = cache(async (): Promise<void> => {
  if (process.env.VERCEL !== "1") return;
  const h = await headers();
  // Set by proxy.ts on every request; /api requests are the source of truth and never sync.
  if (h.get("x-caimao-surface") !== "page") return;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const forward: Record<string, string> = { cookie: h.get("cookie") ?? "" };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) forward["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    const res = await fetch(`${proto}://${host}/api/demo/state`, { headers: forward, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) importDemoSnapshot((await res.json()) as DemoSnapshot);
    else console.warn(`[demo] state sync skipped: HTTP ${res.status}`);
  } catch (e) {
    console.warn("[demo] state sync failed:", e instanceof Error ? e.message : e);
  }
});

/** Resolves the signed-in user and returns a repository scoped to them. */
export async function getRepository(): Promise<Repository> {
  if (dataMode() === "memory") {
    const store = await cookies();
    const userId = await verifyDemoSession(store.get(DEMO_COOKIE)?.value);
    if (!userId) throw new UnauthorizedError();
    await syncDemoStateForPage();
    return new MemoryRepository(userId);
  }

  const user = await createUserClient();
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) throw new UnauthorizedError();
  const admin = createAdminClient();
  const repo = new SupabaseRepository(user, admin, data.user.id);

  // First sign-in: give the account the demo dataset so every screen has data.
  const { data: profile } = await user.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!profile) await seedSupabaseUser(admin, data.user.id, "standard", data.user.email ?? undefined);
  return repo;
}

export async function getRepositoryOrNull(): Promise<Repository | null> {
  try {
    return await getRepository();
  } catch (e) {
    if (e instanceof UnauthorizedError) return null;
    throw e;
  }
}
