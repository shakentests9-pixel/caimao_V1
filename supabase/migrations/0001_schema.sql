-- CaiMao — schema, row-level security and the atomic sandbox execution function.
-- Run with `supabase db push` or paste into the Supabase SQL editor.
-- Money moves only through commit_sandbox_execution(), which only the server's service role may call.

-- gen_random_uuid() is built into PostgreSQL 13+, so no extension is required.

-- ───────────────────────────── Users & profiles ─────────────────────────────
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references public.users (id) on delete cascade,
  full_name text not null,
  home_country text not null check (home_country in ('SG','GB','CN','VN','HK','US')),
  study_country text not null check (study_country in ('SG','GB','CN','VN','HK','US')),
  home_currency text not null check (home_currency in ('USD','GBP','SGD','CNY','HKD','VND')),
  study_currency text not null check (study_currency in ('USD','GBP','SGD','CNY','HKD','VND')),
  base_currency text not null default 'SGD' check (base_currency in ('USD','GBP','SGD','CNY','HKD','VND')),
  university text,
  -- Standing AI permission. Level 3 (execute) is never standing: every execution needs its own approval.
  ai_permission_level smallint not null default 2 check (ai_permission_level between 0 and 2),
  documents_on_file text[] not null default '{}',
  demo_scenario text not null default 'standard',
  created_at timestamptz not null default now()
);

-- Mirror new auth users into public.users.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ───────────────────────────── Money ─────────────────────────────
create table if not exists public.accounts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  institution text not null,
  country text not null,
  currency text not null check (currency in ('USD','GBP','SGD','CNY','HKD','VND')),
  balance numeric(18,2) not null check (balance >= 0),
  -- Only the last four digits are stored. Full account numbers and banking passwords are never stored.
  account_last4 char(4) not null,
  kind text not null check (kind in ('bank','wallet')),
  created_at timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts (user_id);

create table if not exists public.transactions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  account_id text not null references public.accounts (id) on delete cascade,
  date date not null,
  description text not null,
  merchant text not null,
  amount numeric(18,2) not null,
  currency text not null,
  category text not null,
  category_source text not null default 'classifier' check (category_source in ('classifier','system')),
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

create table if not exists public.obligations (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('tuition','rent','card','other')),
  payee text not null,
  invoice_ref text not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null,
  due_date date not null,
  status text not null check (status in ('UPCOMING','PAYMENT_DUE','PROCESSING','PAID')),
  purpose text not null,
  destination_country text not null,
  paid_at timestamptz,
  payment_execution_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists obligations_user_due_idx on public.obligations (user_id, due_date);

create table if not exists public.budgets (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  category text not null,
  monthly_limit numeric(18,2) not null,
  currency text not null
);

create table if not exists public.credit_cards (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  issuer text not null,
  last4 char(4) not null,
  currency text not null,
  credit_limit numeric(18,2) not null,
  current_balance numeric(18,2) not null,
  payment_due_date date not null,
  minimum_payment numeric(18,2) not null,
  payment_history jsonb not null default '[]'
);

create table if not exists public.bank_setup_checklist (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  country text not null,
  label text not null,
  detail text not null,
  completed boolean not null default false
);

-- ───────────────────────────── Reference data ─────────────────────────────
create table if not exists public.country_rules (
  id text primary key,
  source_country text not null,          -- ISO code or '*'
  destination_country text not null,     -- ISO code or '*'
  transaction_type text not null check (transaction_type in ('education','personal','any')),
  rule_name text not null,
  rule_description text not null,
  currency text,
  limit_amount numeric(18,2),
  enforcement text not null check (enforcement in ('block_above','documents_above','documents_always','info')),
  documentation_required text[] not null default '{}',
  official_source text not null,
  official_source_url text not null,
  effective_date date not null,
  last_verified date not null,
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH')),
  is_demo boolean not null default true
);

create table if not exists public.fx_rates (
  base text not null default 'USD',
  quote text not null,
  rate numeric(20,8) not null check (rate > 0),
  as_of timestamptz not null default now(),
  source text not null,
  primary key (base, quote)
);

create table if not exists public.remittance_providers (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('bank','remittance','wallet')),
  fx_margin numeric(8,6) not null,
  fixed_fee numeric(18,2) not null,
  fee_currency text not null,
  pct_fee numeric(8,6) not null default 0,
  other_charges numeric(18,2) not null default 0,
  advertises_zero_fee boolean not null default false,
  settlement_business_days int not null,
  settlement_label text not null,
  max_single_transfer numeric(18,2) not null,
  max_currency text not null,
  is_demo boolean not null default true
);

-- ───────────────────────────── Workflow ─────────────────────────────
create table if not exists public.remittance_quotes (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  provider_id text not null references public.remittance_providers (id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_requests (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  obligation_id text references public.obligations (id),
  source_account_id text not null references public.accounts (id),
  provider_id text not null references public.remittance_providers (id),
  quote_id uuid not null,
  recipient text not null,
  recipient_country text not null,
  purpose text not null,
  invoice_ref text,
  source_amount numeric(18,2) not null check (source_amount > 0),
  source_currency text not null,
  destination_amount numeric(18,2) not null check (destination_amount > 0),
  destination_currency text not null,
  provider_fx_rate numeric(20,8) not null,
  market_fx_rate numeric(20,8) not null,
  transfer_fee numeric(18,2) not null,
  total_cost numeric(18,2) not null,
  estimated_settlement_date date not null,
  compliance_status text not null check (compliance_status in ('COMPLIANT','ACTION_REQUIRED','BLOCKED')),
  compliance_snapshot jsonb not null,
  required_documents jsonb not null default '[]',
  status text not null check (status in ('PENDING_APPROVAL','APPROVED','EXECUTING','COMPLETED','FAILED','CANCELLED','REJECTED')),
  prepared_by text not null check (prepared_by in ('ai_agent','user')),
  approved_at timestamptz,
  approval_ack boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- An approved or executed request must carry the user's explicit acknowledgement.
  constraint approval_requires_ack check (status not in ('APPROVED','EXECUTING','COMPLETED') or (approval_ack and approved_at is not null)),
  constraint no_execution_when_blocked check (compliance_status = 'COMPLIANT' or status in ('REJECTED','CANCELLED','FAILED'))
);
create index if not exists transfer_requests_user_idx on public.transfer_requests (user_id, created_at desc);

create sequence if not exists public.payment_txn_seq start 184;

create table if not exists public.payment_executions (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique,
  user_id uuid not null references public.users (id) on delete cascade,
  transfer_request_id uuid not null unique references public.transfer_requests (id),
  status text not null check (status in ('COMPLETED','FAILED')),
  timestamp timestamptz not null default now(),
  provider text not null,
  source_amount numeric(18,2) not null,
  source_currency text not null,
  destination_amount numeric(18,2) not null,
  destination_currency text not null,
  fee numeric(18,2) not null,
  recipient text not null,
  failure_reason text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  actor text not null check (actor in ('ai_agent','user','system')),
  action text not null,
  tool text,
  permission_level smallint not null check (permission_level between 0 and 3),
  details jsonb not null default '{}',
  approval_status text not null check (approval_status in ('NOT_REQUIRED','PENDING','APPROVED','DECLINED')),
  result text not null check (result in ('SUCCESS','FAILURE','BLOCKED')),
  correlation_id text
);
create index if not exists audit_logs_user_ts_idx on public.audit_logs (user_id, timestamp desc);

-- Audit logs are append-only, even for the service role.
create or replace function public.audit_logs_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id text not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── Row-level security ─────────────────────────────
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.obligations enable row level security;
alter table public.budgets enable row level security;
alter table public.credit_cards enable row level security;
alter table public.bank_setup_checklist enable row level security;
alter table public.country_rules enable row level security;
alter table public.fx_rates enable row level security;
alter table public.remittance_providers enable row level security;
alter table public.remittance_quotes enable row level security;
alter table public.transfer_requests enable row level security;
alter table public.payment_executions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_conversations enable row level security;

-- Users read their own rows. There are deliberately no insert/update/delete policies on
-- money tables: balances, transfers and executions change only on the server.
do $$
declare t text;
begin
  foreach t in array array['accounts','transactions','obligations','budgets','credit_cards','bank_setup_checklist',
                           'remittance_quotes','transfer_requests','payment_executions','audit_logs','ai_conversations']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_select_own', t);
  end loop;
end $$;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users for select to authenticated using (id = auth.uid());
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());

-- Users may change their own display settings and checklist ticks, and nothing else.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (base_currency, ai_permission_level, documents_on_file) on public.profiles to authenticated;

drop policy if exists checklist_update_own on public.bank_setup_checklist;
create policy checklist_update_own on public.bank_setup_checklist for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.bank_setup_checklist from authenticated;
grant update (completed) on public.bank_setup_checklist to authenticated;

drop policy if exists ai_conversations_insert_own on public.ai_conversations;
create policy ai_conversations_insert_own on public.ai_conversations for insert to authenticated with check (user_id = auth.uid());

-- Reference data is readable by any signed-in user.
drop policy if exists country_rules_read on public.country_rules;
create policy country_rules_read on public.country_rules for select to authenticated using (true);
drop policy if exists fx_rates_read on public.fx_rates;
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);
drop policy if exists providers_read on public.remittance_providers;
create policy providers_read on public.remittance_providers for select to authenticated using (true);

-- ───────────────────────────── Atomic sandbox execution ─────────────────────────────
-- Called by the server only after the user approved the request in the UI.
-- Checks status, approval, ownership and balance, then applies every write in one transaction.
create or replace function public.commit_sandbox_execution(
  p_user_id uuid,
  p_transfer_request_id uuid,
  p_debit_account_id text,
  p_debit_amount numeric,
  p_execution jsonb,
  p_ledger jsonb,
  p_obligation_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req public.transfer_requests%rowtype;
  v_balance numeric;
  v_exec_id uuid := gen_random_uuid();
  v_ts timestamptz := coalesce((p_execution->>'timestamp')::timestamptz, now());
  v_txn_id text;
begin
  select * into v_req from public.transfer_requests
    where id = p_transfer_request_id and user_id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND: transfer request'; end if;
  if v_req.status <> 'EXECUTING' then raise exception 'CONFLICT: transfer request is %', v_req.status; end if;
  if not v_req.approval_ack or v_req.approved_at is null then raise exception 'CONFLICT: transfer request was not approved'; end if;
  if v_req.compliance_status <> 'COMPLIANT' then raise exception 'CONFLICT: transfer request is not compliant'; end if;
  if v_req.source_account_id <> p_debit_account_id then raise exception 'CONFLICT: debit account mismatch'; end if;

  select balance into v_balance from public.accounts
    where id = p_debit_account_id and user_id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND: account'; end if;
  if v_balance < p_debit_amount then raise exception 'INSUFFICIENT_FUNDS'; end if;

  v_txn_id := 'UF-' || extract(year from v_ts)::int || '-' || lpad(nextval('public.payment_txn_seq')::text, 6, '0');

  update public.accounts set balance = balance - p_debit_amount where id = p_debit_account_id;

  insert into public.payment_executions (id, transaction_id, user_id, transfer_request_id, status, timestamp, provider,
    source_amount, source_currency, destination_amount, destination_currency, fee, recipient)
  values (v_exec_id, v_txn_id, p_user_id, p_transfer_request_id, 'COMPLETED', v_ts, p_execution->>'provider',
    (p_execution->>'source_amount')::numeric, p_execution->>'source_currency',
    (p_execution->>'destination_amount')::numeric, p_execution->>'destination_currency',
    (p_execution->>'fee')::numeric, p_execution->>'recipient');

  insert into public.transactions (id, user_id, account_id, date, description, merchant, amount, currency, category, category_source)
  values ('txn-' || v_txn_id, p_user_id, p_debit_account_id, (p_ledger->>'date')::date, p_ledger->>'description',
    p_ledger->>'merchant', (p_ledger->>'amount')::numeric, p_ledger->>'currency', p_ledger->>'category', 'system');

  if p_obligation_id is not null then
    update public.obligations set status = 'PAID', paid_at = v_ts, payment_execution_id = v_exec_id
      where id = p_obligation_id and user_id = p_user_id;
  end if;

  update public.transfer_requests set status = 'COMPLETED' where id = p_transfer_request_id;

  return jsonb_build_object('execution_id', v_exec_id, 'transaction_id', v_txn_id,
    'new_balance', (select balance from public.accounts where id = p_debit_account_id), 'timestamp', v_ts);
end $$;

revoke all on function public.commit_sandbox_execution(uuid, uuid, text, numeric, jsonb, jsonb, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.commit_sandbox_execution(uuid, uuid, text, numeric, jsonb, jsonb, text) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.commit_sandbox_execution(uuid, uuid, text, numeric, jsonb, jsonb, text) to service_role';
  end if;
end $$;
