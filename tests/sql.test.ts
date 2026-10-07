import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Applies supabase/migrations/0001_schema.sql to an in-process PostgreSQL (PGlite)
 * with a minimal stand-in for Supabase's auth schema and roles, then checks the
 * atomic execution function and row-level security.
 */
const MIGRATION = fs.readFileSync(path.join(__dirname, "../supabase/migrations/0001_schema.sql"), "utf8");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
`;

async function seedUser(id: string, balance: number) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id.slice(0, 4)}@test`]);
  await db.query(
    `insert into public.profiles (id, full_name, home_country, study_country, home_currency, study_currency) values ($1, 'Test', 'SG', 'GB', 'SGD', 'GBP')`,
    [id],
  );
  await db.query(`insert into public.accounts (id, user_id, name, institution, country, currency, balance, account_last4, kind) values ($1, $2, 'Singapore Bank', 'Home Bank', 'SG', 'SGD', $3, '4821', 'bank')`, [`acc-${id.slice(0, 4)}`, id, balance]);
  await db.query(
    `insert into public.obligations (id, user_id, title, kind, payee, invoice_ref, amount, currency, due_date, status, purpose, destination_country) values ($1, $2, 'Tuition', 'tuition', 'Example University Treasury', 'TUITION-2026-001', 15000, 'GBP', current_date + 12, 'PAYMENT_DUE', 'Education / Tuition', 'GB')`,
    [`obl-${id.slice(0, 4)}`, id],
  );
}

async function transferRequest(id: string, user: string, status: string, ack: boolean, amount = 26105.57) {
  await db.query(
    `insert into public.transfer_requests (id, user_id, obligation_id, source_account_id, provider_id, quote_id, recipient, recipient_country, purpose, invoice_ref,
      source_amount, source_currency, destination_amount, destination_currency, provider_fx_rate, market_fx_rate, transfer_fee, total_cost, estimated_settlement_date,
      compliance_status, compliance_snapshot, status, prepared_by, approved_at, approval_ack, expires_at)
     values ($1, $2, $3, $4, 'prov-panda-remit-demo', gen_random_uuid(), 'Example University Treasury', 'GB', 'Education / Tuition', 'TUITION-2026-001',
      $5, 'SGD', 15000, 'GBP', 0.5749, 0.5775, 15, 131.93, current_date + 2, 'COMPLIANT', '{}', $6, 'ai_agent', $7, $8, now() + interval '15 minutes')`,
    [id, user, `obl-${user.slice(0, 4)}`, `acc-${user.slice(0, 4)}`, amount, status, ack ? new Date().toISOString() : null, ack],
  );
}

const commit = (user: string, tr: string, amount = 26105.57) =>
  db.query<{ r: { transaction_id: string; new_balance: number } }>(
    `select public.commit_sandbox_execution($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) as r`,
    [
      user,
      tr,
      `acc-${user.slice(0, 4)}`,
      amount,
      JSON.stringify({ provider: "Panda Remit Demo", source_amount: amount, source_currency: "SGD", destination_amount: 15000, destination_currency: "GBP", fee: 15, recipient: "Example University Treasury" }),
      JSON.stringify({ date: new Date().toISOString().slice(0, 10), description: "Tuition", merchant: "Panda Remit Demo transfer", amount: -amount, currency: "SGD", category: "Education" }),
      `obl-${user.slice(0, 4)}`,
    ],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(MIGRATION);
  await db.exec(`grant select, insert, update on all tables in schema public to authenticated; grant all on all tables in schema public to service_role;`);
  // Re-apply the column-level restrictions the migration sets, since the blanket grant above widened them.
  await db.exec(`revoke update on public.profiles, public.bank_setup_checklist from authenticated;
    grant update (base_currency, ai_permission_level, documents_on_file) on public.profiles to authenticated;
    grant update (completed) on public.bank_setup_checklist to authenticated;`);
  await db.query(`insert into public.remittance_providers (id, name, kind, fx_margin, fixed_fee, fee_currency, settlement_business_days, settlement_label, max_single_transfer, max_currency) values ('prov-panda-remit-demo', 'Panda Remit Demo', 'remittance', 0.0045, 15, 'SGD', 1, 'Within 1 business day', 200000, 'SGD')`);
  await seedUser(A, 32000);
  await seedUser(B, 5000);
}, 60000);

describe("schema migration", () => {
  it("creates every table the spec lists", async () => {
    const { rows } = await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public'`);
    const names = rows.map((r) => r.table_name);
    for (const t of ["users", "profiles", "accounts", "transactions", "obligations", "budgets", "country_rules", "fx_rates", "remittance_providers", "remittance_quotes", "transfer_requests", "payment_executions", "audit_logs", "ai_conversations"]) {
      expect(names).toContain(t);
    }
  });

  it("mirrors auth users into public.users", async () => {
    const { rows } = await db.query(`select id from public.users`);
    expect(rows).toHaveLength(2);
  });
});

describe("commit_sandbox_execution", () => {
  it("refuses a request without user approval", async () => {
    const id = "aaaaaaaa-0000-4000-8000-000000000001";
    await transferRequest(id, A, "PENDING_APPROVAL", false);
    await expect(commit(A, id)).rejects.toThrow(/CONFLICT/);
  });

  it("refuses when funds are insufficient and changes nothing", async () => {
    const id = "bbbbbbbb-0000-4000-8000-000000000001";
    await transferRequest(id, B, "EXECUTING", true);
    await expect(commit(B, id)).rejects.toThrow(/INSUFFICIENT_FUNDS/);
    const { rows } = await db.query<{ balance: string }>(`select balance from public.accounts where user_id = $1`, [B]);
    expect(Number(rows[0].balance)).toBe(5000);
  });

  it("commits debit, execution, ledger entry and PAID status atomically", async () => {
    const id = "aaaaaaaa-0000-4000-8000-000000000002";
    await transferRequest(id, A, "EXECUTING", true);
    const { rows } = await commit(A, id);
    expect(rows[0].r.transaction_id).toMatch(/^UF-\d{4}-000184$/);
    expect(Number(rows[0].r.new_balance)).toBeCloseTo(32000 - 26105.57, 2);
    const ob = await db.query<{ status: string }>(`select status from public.obligations where user_id = $1`, [A]);
    expect(ob.rows[0].status).toBe("PAID");
    const tr = await db.query<{ status: string }>(`select status from public.transfer_requests where id = $1`, [id]);
    expect(tr.rows[0].status).toBe("COMPLETED");
    await expect(commit(A, id)).rejects.toThrow(/CONFLICT/); // no double execution
  });

  it("rejects an approved status without the acknowledgement (table constraint)", async () => {
    await expect(transferRequest("aaaaaaaa-0000-4000-8000-000000000003", A, "APPROVED", false)).rejects.toThrow(/approval_requires_ack/);
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    await db.query(`insert into public.audit_logs (user_id, actor, action, permission_level, approval_status, result) values ($1, 'ai_agent', 'TRANSFER_RULE_CHECK', 1, 'NOT_REQUIRED', 'SUCCESS')`, [A]);
    await expect(db.query(`update public.audit_logs set result = 'FAILURE'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from public.audit_logs`)).rejects.toThrow(/append-only/);
  });
});

describe("row-level security", () => {
  const asUser = async <T>(uid: string, fn: () => Promise<T>) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  };

  it("users only see their own accounts", async () => {
    const rows = await asUser(B, async () => (await db.query<{ user_id: string }>(`select user_id from public.accounts`)).rows);
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(B);
  });

  it("users cannot change balances directly", async () => {
    await asUser(B, () => db.query(`update public.accounts set balance = 999999`));
    const { rows } = await db.query<{ balance: string }>(`select balance from public.accounts where user_id = $1`, [B]);
    expect(Number(rows[0].balance)).toBe(5000);
  });

  it("users cannot call the execution function", async () => {
    await expect(asUser(A, () => commit(A, "aaaaaaaa-0000-4000-8000-000000000001"))).rejects.toThrow(/permission denied/);
  });

  it("users cannot raise their own AI permission to execute", async () => {
    await expect(asUser(A, () => db.query(`update public.profiles set ai_permission_level = 3 where id = '${A}'`))).rejects.toThrow(/check constraint|violates/);
  });
});
