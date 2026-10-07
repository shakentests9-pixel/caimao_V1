/**
 * Seeds Supabase with the demo dataset.
 *
 *   npm run db:seed -- --email alex.tan@demo.caimao.app --password 'choose-a-password'
 *
 * Creates (or reuses) the Supabase Auth user, then writes reference data
 * (rules, FX rates, providers) and Alex Tan's accounts, transactions and obligations.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or .env.local.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { seedSupabaseUser } from "../lib/data/supabase";
import { DEMO_EMAIL } from "../lib/seed";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  const email = arg("email") ?? DEMO_EMAIL;
  const password = arg("password") ?? process.env.DEMO_USER_PASSWORD;
  if (!password || password.length < 8) throw new Error("Pass --password (8+ characters) or set DEMO_USER_PASSWORD.");

  const admin = createClient(url, key, { auth: { persistSession: false } });
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Alex Tan" } });
  if (created.data.user) userId = created.data.user.id;
  else {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = data.users.find((u) => u.email === email)?.id;
    if (!userId) throw new Error(created.error?.message ?? "Could not create or find the demo user.");
    await admin.auth.admin.updateUserById(userId, { password });
  }

  await seedSupabaseUser(admin, userId, "standard", email);
  console.log(`Seeded demo data for ${email} (${userId}). Sign in at /login with that email and password.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
