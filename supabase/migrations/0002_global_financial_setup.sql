-- CaiMao 0002 — global financial setup.
--   * Japan / JPY support
--   * cross-border profile fields and language preference
--   * regulatory knowledge layer (country_rules extended, not duplicated)
--   * Banking Abroad reference data: banks, account requirements, credit systems
--   * Financial Setup journey progress
--   * bank statement analysis (structured rows only; raw files are never stored)
-- Additive and idempotent: safe to run on a database that already has 0001.

-- ───────────────────────────── Countries & currencies ─────────────────────────────
alter table public.profiles drop constraint if exists profiles_home_country_check;
alter table public.profiles drop constraint if exists profiles_study_country_check;
alter table public.profiles drop constraint if exists profiles_home_currency_check;
alter table public.profiles drop constraint if exists profiles_study_currency_check;
alter table public.profiles drop constraint if exists profiles_base_currency_check;
alter table public.profiles add constraint profiles_home_country_check check (home_country in ('SG','GB','CN','VN','HK','US','JP'));
alter table public.profiles add constraint profiles_study_country_check check (study_country in ('SG','GB','CN','VN','HK','US','JP'));
alter table public.profiles add constraint profiles_home_currency_check check (home_currency in ('USD','GBP','SGD','CNY','HKD','VND','JPY'));
alter table public.profiles add constraint profiles_study_currency_check check (study_currency in ('USD','GBP','SGD','CNY','HKD','VND','JPY'));
alter table public.profiles add constraint profiles_base_currency_check check (base_currency in ('USD','GBP','SGD','CNY','HKD','VND','JPY'));
alter table public.accounts drop constraint if exists accounts_currency_check;
alter table public.accounts add constraint accounts_currency_check check (currency in ('USD','GBP','SGD','CNY','HKD','VND','JPY'));

-- ───────────────────────────── Cross-border profile ─────────────────────────────
-- Null means "not told yet". CaiMao asks for missing fields instead of assuming eligibility.
alter table public.profiles add column if not exists nationality text check (nationality is null or nationality in ('SG','GB','CN','VN','HK','US','JP'));
alter table public.profiles add column if not exists visa_type text check (visa_type is null or visa_type in ('student','work','dependant','permanent_resident','citizen','visitor','none'));
alter table public.profiles add column if not exists residency_status text check (residency_status is null or residency_status in ('resident','non_resident'));
alter table public.profiles add column if not exists student_status text check (student_status is null or student_status in ('full_time','part_time','admitted','not_student'));
alter table public.profiles add column if not exists age smallint check (age is null or age between 13 and 120);
alter table public.profiles add column if not exists tax_residency text check (tax_residency is null or tax_residency in ('SG','GB','CN','VN','HK','US','JP'));
alter table public.profiles add column if not exists language text not null default 'en' check (language in ('en','zh-CN','ja'));

-- Users may edit these fields about themselves (in addition to 0001's display settings).
grant update (nationality, visa_type, residency_status, student_status, age, tax_residency, language, home_country, study_country) on public.profiles to authenticated;

-- ───────────────────────────── Regulatory knowledge layer ─────────────────────────────
-- country_rules is extended rather than duplicated. status separates researched rules from the
-- simulated demo rules; the assistant only ever cites rows from this table.
-- Some official pages don't state an effective date; null is more honest than a placeholder.
alter table public.country_rules alter column effective_date drop not null;
alter table public.country_rules drop constraint if exists country_rules_enforcement_check;
alter table public.country_rules add constraint country_rules_enforcement_check
  check (enforcement in ('block_above','documents_above','documents_always','report_above','info'));
alter table public.country_rules add column if not exists status text not null default 'simulated'
  check (status in ('verified','simulated','needs_verification'));
alter table public.country_rules add column if not exists rule_category text
  check (rule_category is null or rule_category in ('fx_control','aml','reporting','documentation','limit','student_provision','tax','consumer_protection'));
alter table public.country_rules add column if not exists direction text check (direction is null or direction in ('outbound','inbound','both'));
alter table public.country_rules add column if not exists channel text not null default 'bank_transfer' check (channel in ('bank_transfer','cash','any'));
alter table public.country_rules add column if not exists nationality_condition text[];
alter table public.country_rules add column if not exists residency_condition text check (residency_condition is null or residency_condition in ('resident','non_resident'));
alter table public.country_rules add column if not exists visa_condition text[];
alter table public.country_rules add column if not exists applies_to text;
alter table public.country_rules add column if not exists minimum_amount numeric(20,2);
alter table public.country_rules add column if not exists maximum_amount numeric(20,2);
alter table public.country_rules add column if not exists restrictions text;
alter table public.country_rules add column if not exists exceptions text;
alter table public.country_rules add column if not exists regulator text;
alter table public.country_rules add column if not exists evidence_quote text;
alter table public.country_rules add column if not exists i18n jsonb;
alter table public.country_rules drop constraint if exists country_rules_verified_has_source;
alter table public.country_rules add constraint country_rules_verified_has_source
  check (status <> 'verified' or (official_source_url like 'https://%' and regulator is not null));
update public.country_rules set status = 'simulated' where is_demo and status <> 'simulated';
create index if not exists country_rules_corridor_idx on public.country_rules (source_country, destination_country);

-- ───────────────────────────── Banking Abroad reference data ─────────────────────────────
create table if not exists public.banks (
  id text primary key,
  country text not null check (country in ('SG','CN','GB','US','JP')),
  bank_name text not null,
  account_type text not null,
  student_account_available boolean,
  international_student_eligible boolean,
  resident_required boolean,
  minimum_age smallint,
  visa_requirements text,
  documents text[] not null default '{}',
  minimum_balance text,
  monthly_fee text,
  international_transfer_support boolean,
  credit_card_available text,
  official_url text not null check (official_url like 'https://%'),
  evidence_quote text,
  notes text,
  last_verified date not null,
  status text not null check (status in ('verified','needs_verification'))
);
create index if not exists banks_country_idx on public.banks (country);

create table if not exists public.bank_account_requirements (
  country text primary key check (country in ('SG','CN','GB','US','JP')),
  summary text not null,
  typical_documents text[] not null default '{}',
  eligibility_factors text[] not null default '{}',
  sources text[] not null default '{}',
  last_verified date not null,
  i18n jsonb
);

create table if not exists public.credit_system_rules (
  country text primary key check (country in ('SG','CN','GB','US','JP')),
  has_formal_bureau boolean,
  bureaus text[] not null default '{}',
  what_contributes text[] not null default '{}',
  why_it_matters text[] not null default '{}',
  responsible_behaviours text[] not null default '{}',
  risks text[] not null default '{}',
  foreigner_notes text,
  sources text[] not null default '{}',
  last_verified date not null
);

-- ───────────────────────────── Financial Setup journey ─────────────────────────────
-- Steps are built from the reference tables at request time; only the user's ticks are stored.
create table if not exists public.user_financial_setup (
  user_id uuid not null references public.users (id) on delete cascade,
  country text not null check (country in ('SG','CN','GB','US','JP')),
  step_key text not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, country, step_key)
);

-- ───────────────────────────── Statement analysis ─────────────────────────────
-- The uploaded file is parsed in memory on the server and discarded. Only the structured rows
-- below are kept: masked descriptions, no full account numbers, no file contents, no file URL.
create table if not exists public.statement_uploads (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  file_name text not null check (length(file_name) <= 120),
  file_type text not null check (file_type in ('csv','pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 char(64) not null,
  status text not null check (status in ('PREVIEW','CONFIRMED')),
  currency text not null check (currency in ('USD','GBP','SGD','CNY','HKD','VND','JPY')),
  period_start date,
  period_end date,
  account_hint text check (account_hint is null or account_hint ~ '^••••[0-9]{0,4}$'),
  row_count integer not null check (row_count >= 0),
  low_confidence_count integer not null default 0,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz,
  constraint statement_confirmed_has_time check (status <> 'CONFIRMED' or confirmed_at is not null)
);
create index if not exists statement_uploads_user_idx on public.statement_uploads (user_id, created_at desc);

create table if not exists public.statement_transactions (
  id text primary key,
  upload_id uuid not null references public.statement_uploads (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  description text not null check (length(description) <= 300),
  merchant text not null,
  amount numeric(18,2) not null,
  currency text not null,
  direction text not null check (direction in ('credit','debit')),
  reference text,
  category text not null,
  subcategory text,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  category_source text not null check (category_source in ('rule','merchant','ai','user','fallback')),
  needs_review boolean not null default false,
  included boolean not null default true
);
create index if not exists statement_transactions_upload_idx on public.statement_transactions (upload_id);

create table if not exists public.statement_analyses (
  id uuid primary key,
  upload_id uuid not null unique references public.statement_uploads (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  result jsonb not null
);

-- ───────────────────────────── Row-level security ─────────────────────────────
alter table public.banks enable row level security;
alter table public.bank_account_requirements enable row level security;
alter table public.credit_system_rules enable row level security;
alter table public.user_financial_setup enable row level security;
alter table public.statement_uploads enable row level security;
alter table public.statement_transactions enable row level security;
alter table public.statement_analyses enable row level security;

-- Per-user tables: read own rows only. Writes happen on the server, filtered by the verified user id.
do $$
declare t text;
begin
  foreach t in array array['user_financial_setup','statement_uploads','statement_transactions','statement_analyses']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_select_own', t);
  end loop;
end $$;

-- Reference data: readable by any signed-in user, writable by nobody but the service role.
drop policy if exists banks_read on public.banks;
create policy banks_read on public.banks for select to authenticated using (true);
drop policy if exists bank_account_requirements_read on public.bank_account_requirements;
create policy bank_account_requirements_read on public.bank_account_requirements for select to authenticated using (true);
drop policy if exists credit_system_rules_read on public.credit_system_rules;
create policy credit_system_rules_read on public.credit_system_rules for select to authenticated using (true);

-- Unconfirmed statement previews are temporary. The app purges expired previews on each upload;
-- this function lets a scheduled job do the same for everyone.
create or replace function public.purge_expired_statement_previews() returns integer
language sql security definer set search_path = public as $$
  with gone as (delete from public.statement_uploads where status = 'PREVIEW' and expires_at < now() returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function public.purge_expired_statement_previews() from public, anon, authenticated;
