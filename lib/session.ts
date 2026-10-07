import "server-only";
import { cookies } from "next/headers";
import { dataMode } from "./config";
import { DEMO_COOKIE, verifyDemoSession } from "./auth/demo-session";
import { MemoryRepository } from "./data/memory";
import { SupabaseRepository, seedSupabaseUser } from "./data/supabase";
import type { Repository } from "./data/repository";
import { createAdminClient, createUserClient } from "./supabase/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue.");
  }
}

/** Resolves the signed-in user and returns a repository scoped to them. */
export async function getRepository(): Promise<Repository> {
  if (dataMode() === "memory") {
    const store = await cookies();
    const userId = await verifyDemoSession(store.get(DEMO_COOKIE)?.value);
    if (!userId) throw new UnauthorizedError();
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
