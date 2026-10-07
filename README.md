# CaiMao

**A scholarly cat that helps international students manage money across borders, while the student approves every payment.**

CaiMao (formerly the *CaiMao* MVP) is a competition entry for the theme *AI as a Financial Participant*. An international student (the demo user, Alex Tan, studies in the UK and is funded from Singapore) asks CaiMao to pay their tuition. The agent finds the invoice, reads balances, checks the transfer rules held in a regulatory database, compares remittance providers on what actually reaches the university, recommends a route, prepares the transfer and waits. Only when the student ticks *I reviewed this transfer* and presses **Confirm & Pay** does a sandbox payment execute. Balances update, the invoice is marked paid, and every step is written to an append-only audit log shown on the Activity & Security page.

```
Understand → Analyse → Check compliance → Compare → Recommend → Obtain approval → Execute → Verify
```

That sequence is visible on screen throughout the assistant workflow (route `/copilot`) and again, per run, on the Activity & Security page (route `/evidence`).

> **Sandbox only.** No real money moves. Regulatory rules are **simulated demo data** labelled as such, with the official regulator linked for verification. FX rates are seeded demo rates.

---

## Contents

1. [Product overview](#product-overview)
2. [Five-minute demo script](#five-minute-demo-script)
3. [Brand and design system](#brand-and-design-system)
4. [System architecture](#system-architecture)
5. [Technology stack](#technology-stack)
6. [Installation](#installation)
7. [Environment variables](#environment-variables)
8. [Database setup](#database-setup)
9. [Seed data](#seed-data)
10. [Running locally](#running-locally)
11. [AI architecture](#ai-architecture)
12. [Security design](#security-design)
13. [Sandbox execution](#sandbox-execution)
14. [Test cases](#test-cases)
15. [Deployment](#deployment)
16. [Project layout](#project-layout)
17. [Known limitations](#known-limitations)

---

## Product overview

| Screen | Route | What it does |
| --- | --- | --- |
| **Splash → Intro** | `/welcome` | Orange splash with the CaiMao lockup, then *Study abroad. Manage money smarter.* with **Get started** (opens the demo account locally, or sign-up with Supabase) and **I already have an account**. Signed-out visitors to `/` land here. |
| **Home** | `/` | Greeting and route, a cocoa→orange balance card (hide/show, per-currency split), a CaiMao insight (*Your tuition is due in 12 days*, **See my options**), quick actions, account cards, a "Coming up" timeline with **Pay with CaiMao**, a spending donut and recent activity. |
| **Assistant** | `/copilot` | Conversation with CaiMao. Each reply opens with what CaiMao checked; **See what CaiMao checked** expands the real tool calls, permission levels and results. Tuition, funds and transfer requirements combine into one summary card; the **Best option** card has **Prepare payment**. Eight-step tracker on top, composer with quick prompts at the bottom. |
| **Transfer requirements → Review → Success** | review sheet | Opens when a transfer is prepared. **Ready to send?** lists each requirement from the stored compliance result (*Identity verified*, *Tuition invoice ready*, *Source of funds ready*, *University reference ready*, *Within the transfer limit*) with every rule one tap away. **Review your transfer** shows amounts, recipient, account, provider, fee, rate vs mid-market and arrival, then the acknowledgement box and **Confirm & Pay**. **Tuition paid** shows the receipt, **View receipt** and **Done**. |
| **Transfers** | `/transfers` | "You send / They receive" calculator with live quotes, providers ranked by what arrives (**Best value**), **See full comparison**, corridor rules with source and last-verified date, transfer history. |
| **Budget** | `/budget` | "Your October" hero, CaiMao's spending insights, category cards, upcoming bills, transactions. |
| **Bills & obligations** | `/obligations` | Tuition hero, **Upcoming / Paid / All** tabs, month grouping and urgency labels. |
| **Banking & Credit** | `/banking` | Card visual, next payment and minimum, payment history, *Build your UK financial profile* checklist and the local bank setup checklist per country. |
| **Activity & Security** | `/evidence` | Verified-transfer card, *How this payment happened* timeline, technical audit log, JSON export. |
| **Profile / Settings** | `/profile`, `/settings` | Identity, route, settings list, what CaiMao can do (permission level), activity summary; full settings incl. demo scenarios. |

Every status (Ready, Action needed, Blocked, Payment due, Best value, Completed, Pending approval, Paid) is shown as icon + word + colour, never colour alone.

---

## Five-minute demo script

1. Open the app: the **splash** plays, then the **intro**. Press **Get started** (local mode signs in as Alex Tan). Home shows the balance card and CaiMao's note: *Your tuition is due in 12 days. I found a route that could leave about GBP 254 more with Example University.*
2. Press **See my options**. CaiMao works ("Checking your accounts…", "Checking transfer requirements…") while the tracker fills in. The reply shows one summary card (tuition, available funds, **Transfer requirements: Ready**) and the **Best option** card.
3. Point out that **Home Bank charges no fee but delivers the least**; Panda Remit Demo gets about **GBP 254 more** to the university. Open **Compare all 3 routes** and **See what CaiMao checked** to show the real tool calls with their permission levels.
4. Press **Prepare payment**. The server re-checks the rules and prepares an instruction (*Your transfer is ready to review*, Level 2). The sheet opens on **Ready to send?** with each requirement and **See all 5 rules checked**.
5. Press **Review transfer**: *You send SGD 26,105.57 → Example University receives GBP 15,000.00*, account, provider, fee, exchange rate vs mid-market, arrival, **Requirements: Checked**, **Documents: Complete**. Tick **I reviewed this transfer**, press **Confirm & Pay**.
6. **Tuition paid**: transaction **UF-2026-000184**, new balance SGD 5,894.43. The tracker reaches *Verify*.
7. **Done → Home**: the balance has updated, CaiMao says *Your tuition is sorted*, and tuition shows **Paid** in the timeline.
8. **Activity & Security**: the verified-transfer card and the timeline (requirements checked → providers compared → approved by Alex → payment executed → balance updated → tuition marked paid). Open **View technical audit log** for every event.

Optional, 30 seconds each, from **Settings → Demo settings**:

- **Insufficient funds**: the agent stops after the funds check and prepares nothing.
- **Over the transfer limit**: the requirements row turns red (**Blocked**) and *This transfer can't go ahead* cites the SGD 200,000 demo rule; nothing is prepared.
- Under **Documents**, untick *Source-of-funds declaration*: requirements show **Action needed** and **Review transfer** stays disabled.
- Under **How CaiMao can help**, choose **View**: CaiMao can analyse, but its attempt to prepare a payment is blocked and logged as `PERMISSION_DENIED`.

## Brand and design system

The brand comes from the CaiMao logo (a cat with glasses on an open book, with money flowing between currencies) and the Canva landing design. Tokens live in `app/globals.css` (Tailwind 4 `@theme`).

| Token | Value | Use |
| --- | --- | --- |
| Primary (`brand`) | `#A84A1A` | Primary buttons, active nav, receive amounts, links. White text on it is 5.7:1 |
| Dark (`cocoa`) | `#3A2117` | Type, premium cards, user chat bubbles |
| Background (`ivory`) | `#FFF8F2` | Page surface |
| White | `#FFFFFF` | Cards |
| Soft cream (`cream`) | `#F6EADF` | Inset panels, secondary buttons |
| Gold | `#F5B14C` | Best value, current step halo, card chip, focus ring (text uses `#8A5300`) |
| Peach / Sand | `#F2C7A6` / `#E9D8C8` | Avatars, tiles, tracks |
| Insight surface | `#FFF1E4` with `#F4D2B9` border | CaiMao insight cards |
| Success / Warning / Error | `#3FAF6C` / `#F2A93B` / `#D85C4A` | Fills and soft surfaces. Text uses darker inks (`#23794A`, `#8A5300`, `#B23A2A`) to meet WCAG AA |
| Muted text | `#765B4D` | Labels; AA on white, ivory and cream |
| Premium gradient | `130deg, #3A2117 → #61311D 58% → #A84A1A` | Balance card, card visual, verified transfer |

- **Type:** Nunito Sans (headings, amounts) and Manrope (UI), both self-hosted variable fonts; Geist Mono for transaction IDs, FX rates and tool names.
- **Shape:** 20–28px radii, soft warm shadows (`0 14px 32px rgba(58,33,23,.07)`), raised orange glow on primary buttons.
- **Motion:** splash arrival and breathing, nudging arrows, drawn success check, gold halo on the current step, lift on hover and press on tap. All respects `prefers-reduced-motion`.
- **Brand assets:** `public/brand/caimao-lockup.png` (splash), `caimao-mark.png` (intro, login), `caimao-head.png` (mascot tile, readable down to 32px), `app/icon.png` and `app/apple-icon.png`. The logo background was recoloured from `#9F3D13` to the palette primary `#A84A1A` so it sits seamlessly on orange.
- **Components** (`components/app-shell.tsx`, `components/brand.tsx`, `components/caimao/`): `AppShell`, `NavRail`, `BottomNav`, `PageHeader`, `HeroBalanceCard`, `MascotInsightCard`, `QuickActionGrid`, `AccountCard`, `ObligationTimeline`, `TransferProviderCard` / `ProviderComparison` / `BestOptionCard`, `TransferSummaryCard`, `ChecklistCard`, `BankSetupChecklist`, `ActivityTimeline`, `CreditCardVisual`, `SettingsSection`, `EmptyState`, `SuccessState`, `SplashScreen`, `IntroScreen`, plus `PaymentSnapshot` and `AgentCardView` in `components/agent-cards.tsx`.
- **Layout:** slim white rail on desktop; on phones a top bar plus a docked bottom nav (Home, Transfers, raised CaiMao button, Budget, Profile), sticky composer and transfer button, bottom-sheet dialogs, 44px minimum touch targets.
- **Accessibility:** axe-core reports no WCAG 2 A/AA violations on any page at desktop and phone widths, including the welcome flow and the populated assistant. Focus is trapped in dialogs and Confirm & Pay can't be reached until the review box is ticked.

## System architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js pages<br/>Home · Assistant · Transfers · Activity]
    CD[Review screen<br/>Level 3 gate]
  end

  subgraph Server["Next.js server (route handlers, server components)"]
    PX[proxy.ts<br/>route protection]
    AG["/api/agent<br/>orchestrator (NDJSON stream)"]
    CF["/api/transfers/:id/confirm"]
    TR[Tool registry<br/>permission-checked]
    FIN[Finance services<br/>rules · quotes · prepare · approve · execute]
    FX[Central FX service]
    RE[Remittance engine]
    CE[Compliance engine]
    SB[Sandbox payment rail]
    AU[Audit writer]
    REPO[(Repository)]
  end

  LLM[(Claude API<br/>tool calling)]
  DB[(Supabase Postgres + RLS<br/>or local demo store)]

  UI -->|chat| AG
  AG <-->|tools, results| LLM
  AG --> TR --> FIN
  CD -->|approve + execute| CF --> FIN
  FIN --> FX & RE & CE & SB & AU
  FIN --> REPO --> DB
  PX -.-> AG & CF
```

**Key decisions**

- **Read-only quotes for browsing.** The Transfers calculator calls `GET /api/quotes`, which runs the same engine as the agent but stores and logs nothing; only the agent's tool calls are audited.
- **One path for money.** The only way funds move is `POST /api/transfers/:id/confirm`, which first records the user's approval (`approveTransfer`, actor must be the user, acknowledgement must be `true`) and then runs `executeSandboxTransfer` against that approved request. The model has no tool that can approve or execute.
- **Server-side re-validation.** `createTransferInstruction` re-reads balances and re-evaluates compliance from the database; it does not trust anything the agent concluded earlier.
- **One FX service.** Every conversion goes through `lib/fx/service.ts`. Swapping seeded rates for a live feed means implementing `FxRateSource`.
- **Repository boundary.** `lib/data/repository.ts` has two implementations: `MemoryRepository` (local demo mode and tests) and `SupabaseRepository` (Postgres with RLS). The domain layer doesn't know which is in use.
- **Deterministic numbers.** Quotes, costs and rankings are pure functions of seeded rates and provider pricing, so the demo is reproducible and the tests are exact.

---

## Technology stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, route handlers, server components, `proxy.ts`) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4, shadcn-style components on Radix primitives (Dialog, Checkbox, Collapsible, Slot), lucide icons, Geist font |
| Charts | Recharts |
| Database | Supabase PostgreSQL with row-level security; in-memory demo store when Supabase isn't configured |
| Auth | Supabase Auth (email + password) via `@supabase/ssr`; signed HMAC session cookie in local demo mode |
| AI | Anthropic Claude Messages API with tool use (`@anthropic-ai/sdk`), zod-validated tool inputs, JSON Schema generated from zod |
| Validation | zod |
| Tests | Vitest, PGlite (in-process PostgreSQL) for SQL and RLS tests |

---

## Installation

Requirements: Node.js 20+ (developed on 22) and npm.

```bash
git clone <your-repo-url> caimao
cd caimao
npm install
cp .env.example .env.local
```

That's enough to run in **local demo mode**. Supabase and an Anthropic key are optional.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | For Supabase mode | Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For Supabase mode | Public anon key; all reads go through RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | For Supabase mode | **Server only.** Used for writes and for calling `commit_sandbox_execution`. |
| `UNIFLOW_DATA_MODE` | No | Force `memory` or `supabase`. Defaults to `supabase` when all three Supabase values are set. | (The `UNIFLOW_` prefix is kept from the original MVP so existing deployments keep working.)
| `DEMO_SESSION_SECRET` | Recommended | HMAC key for the demo-mode session cookie. Without it a random per-process secret is used. |
| `DEMO_USER_PASSWORD` | For seeding | Password for the seeded Supabase demo user. |
| `ANTHROPIC_API_KEY` | No | **Server only.** Enables the Claude tool-calling agent. Without it, the built-in planner runs the same tools. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-5-5`. |
| `AGENT_MODE` | No | Force `llm` or `scripted`. |
| `SANDBOX_LATENCY_MS` | No | Simulated provider latency (default 600 ms). |
| `SANDBOX_FORCE_FAILURE` | No | `1` makes the sandbox rail reject payments, to rehearse the `FAILED` path. |

Nothing secret is prefixed `NEXT_PUBLIC_`, and no client component imports a module that reads secrets (server modules import `server-only`).

---

## Database setup

The schema lives in `supabase/migrations/0001_schema.sql`. It creates:

`users`, `profiles`, `accounts`, `transactions`, `obligations`, `budgets`, `country_rules`, `fx_rates`, `remittance_providers`, `remittance_quotes`, `transfer_requests`, `payment_executions`, `audit_logs`, `ai_conversations`, plus `credit_cards` and `bank_setup_checklist` for the Banking & Credit page.

It also defines:

- **Row-level security** on every table. Users can `SELECT` only their own rows; reference tables are readable by any signed-in user. There are **no** insert/update/delete policies on money tables. Users may update only `profiles.base_currency`, `profiles.ai_permission_level` (0–2 by check constraint), `profiles.documents_on_file` and `bank_setup_checklist.completed` (column-level grants).
- **`commit_sandbox_execution(...)`**, a `SECURITY DEFINER` function that locks the transfer request and account, verifies the request is `EXECUTING`, approved, acknowledged and compliant, checks the balance, then debits the account, inserts the execution and ledger entry, marks the obligation `PAID` and completes the request in one transaction. Execute permission is revoked from `anon` and `authenticated` and granted only to `service_role`.
- **Table constraints** that make an approved or executed request without an acknowledgement impossible (`approval_requires_ack`), and a non-compliant request impossible to execute (`no_execution_when_blocked`).
- **Append-only audit log**: a trigger rejects any `UPDATE` or `DELETE` on `audit_logs`.
- A trigger mirroring `auth.users` into `public.users`, and the `payment_txn_seq` sequence that produces IDs like `UF-2026-000184`.

Apply it with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

or paste the file into the Supabase SQL editor and run it.

---

## Seed data

`lib/seed.ts` is the single source of demo data, used by both stores. All dates are relative to the moment of seeding, so tuition is always due in 12 days.

- **User:** Alex Tan · home Singapore (SGD) · studying in the United Kingdom (GBP) · Example University.
- **Accounts:** Singapore Bank SGD 32,000 (****4821) · UK Bank GBP 3,200 (****7730) · Multi-Currency Wallet USD 1,000 (****3092).
- **Obligations:** University Tuition GBP 15,000 (TUITION-2026-001, due +12 days) · Rent GBP 850 (+18) · Student credit card GBP 320 (+5) · Mobile plan GBP 10 (+27).
- **Transactions:** ~35 over four months, categorised by `lib/budget/classifier.ts`.
- **Providers:** Home Bank (no fee, 2.2% FX margin), Panda Remit Demo (SGD 15 fee, 0.45% margin), Multi-Currency Wallet Demo (0.35% fee + SGD 4, 0.40% margin).
- **FX:** seeded mid-market rates for USD, GBP, SGD, CNY, HKD, VND.
- **Rules:** 14 simulated rules across China, Vietnam, Hong Kong, the United States, the United Kingdom and Singapore, each with an official source, effective date, last-verified date and risk level.
- **Scenarios:** `standard`, `insufficient_funds` (SGD 8,000), `over_limit` (GBP 120,000 tuition breaks the SGD 200,000 demo limit).

**Local demo mode** seeds itself on first use (stored in `.data/demo-db.json`; reset from Settings).

**Supabase:**

```bash
npm run db:seed -- --email alex.tan@demo.caimao.app --password 'a-strong-password'
```

This creates the Auth user (email pre-confirmed), writes reference data and Alex's dataset. Any other account that signs up is seeded automatically on first sign-in. *Reset demo* in Settings re-seeds the signed-in user; audit history is kept, because it is append-only.

---

## Running locally

```bash
npm run dev          # http://localhost:3000
npm test             # all tests
npm run lint         # type-check
npm run build && npm start
```

In local demo mode, sign in with **Continue as Alex Tan**. With Supabase configured, sign in with the seeded email and password.

---

## AI architecture

### Orchestrator

`lib/agent/orchestrator.ts` runs per message and streams events (`tool_start`, `tool_end`, `card`, `text`, `phase`, `suggestions`) to the browser as newline-delimited JSON.

- **Claude mode** (`ANTHROPIC_API_KEY` set): a tool-use loop of up to 14 steps. The system prompt sets the safety rules and the tuition workflow; the model decides which tools to call. Tool results go back to the model as JSON; the UI renders cards from those same results.
- **Built-in planner** (no key, or the model is unreachable): `lib/agent/scripted.ts` maps intents to fixed tool sequences and writes its narrative only from tool results. If the model call fails mid-request, the orchestrator says so and falls back to the planner with the same tools.

### Tools

| Tool | Level | Purpose | Offered to the model |
| --- | --- | --- | --- |
| `getUserProfile` | 1 | Countries, currencies, documents on file | ✓ |
| `getAccounts` | 1 | Masked accounts, balances, total in base currency | ✓ |
| `getTransactions` | 1 | 30-day budget summary and recent transactions | ✓ |
| `getObligations` | 1 | Obligations with days until due | ✓ |
| `getFXRate` | 0 | Mid-market rate from the central FX service | ✓ |
| `getTransferRules` | 1 | Rules for a corridor; with an amount, `COMPLIANT` / `ACTION_REQUIRED` / `BLOCKED` | ✓ |
| `getRemittanceQuotes` | 1 | Quotes from all providers | ✓ |
| `calculateTransferCost` | 0 | Total cost per route, ranked by recipient amount, with reasoning | ✓ |
| `createTransferInstruction` | 2 | Prepare (not send) a transfer; server re-checks funds and rules | ✓ |
| `getCreditSummary` | 1 | Card utilisation and due date | ✓ |
| `getBankSetupChecklist` | 0 | Account-opening checklist | ✓ |
| `executeSandboxTransfer` | 3 | Execute an **approved** request | ✗ approval flow only |
| `updateAccountBalance` | 3 | Debit, inside the atomic commit | ✗ |
| `markObligationPaid` | 3 | Mark the invoice paid, inside the atomic commit | ✗ |
| `createAuditLog` | — | Every tool writes its own audit events | ✗ |

`runTool` validates input with zod and enforces the permission level before running anything.

### Cost model

For a send amount `S` with mid-market rate `m` and provider margin `k`:

```
transfer_fee     = fixed_fee + pct_fee × S
convertible      = S − transfer_fee − other_charges
provider_rate    = m × (1 − k)
recipient_gets   = convertible × provider_rate
fx_spread_cost   = convertible × k                      (in the source currency)
total_cost       = transfer_fee + fx_spread_cost + other_charges
```

Routes are compared at a common send amount and **ranked by `recipient_gets`**; ties go to the faster route. The lowest advertised fee earns no preference. For an invoice, CaiMao also computes the exact send amount each provider needs for the recipient to receive the full amount. Every figure is labelled an estimate until execution.

### Safety rules and where they're enforced

| Rule | Enforcement |
| --- | --- |
| Never execute without approval | No execute tool for the model; `executeSandboxTransfer` requires status `APPROVED` with acknowledgement; DB function and constraints re-check |
| Never invent regulations | Rules come only from `country_rules`; a corridor with no rules returns `ACTION_REQUIRED`, never `COMPLIANT` |
| Never invent balances | Balances come only from `getAccounts`; cards render tool output |
| No guaranteed FX savings | Quotes flagged `is_estimate`; copy says "estimated" |
| Estimates vs. confirmed | Comparison and instruction show estimates; the receipt shows executed values |
| Explain the recommendation | `compareQuotes` produces the explanation and per-provider advantage |
| Log every financial action | Audit events for rule checks, quotes, cost calculation, preparation, rejection, approval, decline, execution, balance and obligation updates, permission denials |
| Reject non-compliant transfers | `createTransferInstruction` throws `COMPLIANCE_BLOCKED` / `COMPLIANCE_ACTION_REQUIRED` |
| Confirmation whenever money moves | Confirmation screen with checkbox; server requires `acknowledged: true` |

---

## Security design

- **Authentication**: Supabase Auth, or a signed, `httpOnly`, `SameSite=Lax` cookie in demo mode (HMAC-SHA256, 12-hour expiry, constant-time comparison).
- **Protected routes**: `proxy.ts` redirects unauthenticated page requests to `/login` and returns `401` for API routes. Every route handler resolves the user again through `getRepository()`.
- **Server-side secrets**: Anthropic and Supabase service keys are read only on the server.
- **Row-level security**: see [Database setup](#database-setup). Tested in PGlite.
- **Masked account numbers**: only the last four digits are stored (`char(4)`); the UI shows `Account ****4821`.
- **No credentials**: CaiMao never asks for, stores or passes banking passwords; the model never sees credentials or email addresses (stripped from `getUserProfile`).
- **Approval and audit**: Level 3 per transaction; audit log append-only at the database level.
- **Replay protection**: compare-and-set status transitions; a request can be approved once and executed once; quotes expire after 15 minutes.
- **Headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy.

---

## Sandbox execution

`lib/payments/sandbox.ts` is the mock payment API. Given an approved instruction it returns a provider reference (or a failure). `executeSandboxTransfer` then commits the result and returns:

```json
{
  "transaction_id": "UF-2026-000184",
  "status": "COMPLETED",
  "timestamp": "2026-10-03T14:27:40.123Z",
  "provider": "Panda Remit Demo",
  "source_amount": 26105.57,
  "source_currency": "SGD",
  "destination_amount": 15000,
  "destination_currency": "GBP",
  "fee": 15,
  "recipient": "Example University Treasury",
  "new_balance": 5894.43,
  "obligation_status": "PAID",
  "provider_reference": "SBX-…"
}
```

Audit events for the run: `TRANSFER_RULE_CHECK → QUOTE_RETRIEVAL → COST_CALCULATION → TRANSFER_PREPARED → USER_APPROVAL → TRANSFER_EXECUTED → BALANCE_UPDATED → OBLIGATION_PAID`. Download them from **Activity & Security → Export**.

---

## Test cases

```bash
npm test
```

32 tests across four files.

| # | Scenario | Expected | Test |
| --- | --- | --- | --- |
| 1 | Sufficient funds, valid route | Payment succeeds after approval; full audit chain | `tests/tuition-workflow.test.ts` |
| 2 | Insufficient funds | Agent stops at the funds check; server refuses to prepare | 〃 |
| 3 | Rule violation | `BLOCKED` citing the rule; nothing prepared; missing documents give `ACTION_REQUIRED` | 〃 |
| 4 | User does not approve | Execution refused; balance unchanged; agent can't approve; declined requests can't execute; execute tools hidden from the model | 〃 |
| 5 | Different FX spreads | Highest recipient amount wins over the zero-fee provider; total cost identity holds | 〃 |
| 6 | Payment completes | Balance decreases by the exact amount, invoice `PAID`, ledger entry written, no double execution | 〃 |
| — | Permission model | Level 1 blocks preparation and logs `PERMISSION_DENIED`; expired quotes can't be approved | 〃 |
| — | SQL schema | Migration applies; atomic commit; insufficient funds; append-only audit; RLS isolation; users can't edit balances, call the commit function or grant themselves Level 3 | `tests/sql.test.ts` |
| — | Model fallback | Unreachable model falls back to the planner with the same tools | `tests/agent-fallback.test.ts` |
| — | Budgeting | Classifier categories; neutral insights including the 21% food comparison | `tests/budget.test.ts` |

---

## Deployment

**Vercel + Supabase**

1. Create a Supabase project. Run `supabase/migrations/0001_schema.sql`. In *Authentication → Providers* keep Email enabled.
2. Seed: `npm run db:seed -- --email <email> --password <password>` with the Supabase variables in `.env.local`.
3. Import the repository into Vercel. Add the environment variables from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, optionally `ANTHROPIC_MODEL`). Don't expose the service role key to the browser.
4. Deploy. Sign in with the seeded user.

**Demo-only deployment** (no Supabase): set `UNIFLOW_DATA_MODE=memory` and `DEMO_SESSION_SECRET`. The demo store lives in server memory (mirrored to the OS temp directory on read-only filesystems), so on serverless hosts it can reset between cold starts. Use Supabase for anything beyond a single-presenter demo.

---

## Project layout

```
app/
  (app)/                 authenticated pages: /, copilot, transfers, budget, obligations, banking, settings, evidence (Activity & Security), profile
  api/agent              streaming agent endpoint
  api/transfers/[id]     read, confirm (approve + execute), decline
  api/quotes             read-only quotes for the Transfers calculator
  api/…                  settings, checklist, demo reset, evidence export, auth
  welcome/               splash + intro (public)
  login/
  icon.png, apple-icon.png
components/              app shell + nav, brand (mascot tile, wordmark, lockup), assistant, agent cards, review sheet, progress tracker, compliance card, status badges
components/caimao/       design-system pieces: hero balance card, mascot insight, provider cards, transfer summary, checklists, timelines, credit card, success, splash, intro
public/brand/            CaiMao lockup, mark and head artwork
lib/
  agent/                 protocol, tool registry, orchestrator (Claude), deterministic planner
  budget/                classifier, budget insights
  compliance/engine.ts   rule evaluation
  remittance/engine.ts   quotes, total cost, ranking, explanation
  fx/service.ts          the only FX conversion point
  payments/sandbox.ts    mock payment rail
  data/                  repository interface, memory and Supabase implementations
  finance.ts             prepare / approve / decline / execute
  audit.ts, seed.ts, session.ts, views.ts
proxy.ts                 route protection (signed-out `/` → `/welcome`)
supabase/migrations/     schema, RLS, execution function
scripts/seed-supabase.ts
tests/
```

---

## Known limitations

- **Regulatory data is simulated.** The rules illustrate how a rule engine gates payments; they are not a statement of any country's actual law.
- **FX rates and provider pricing are seeded.** `FxRateSource` is the integration point for a live rate API.
- **Cross-border tuition is the fully executable flow.** Other obligations (rent, card) are displayed and tracked; the agent explains rather than pays them. *Send Money Overseas* compares routes and checks rules but doesn't execute ad-hoc transfers.
- **Supabase and Claude paths.** The Supabase SQL is tested against PostgreSQL via PGlite with a stand-in for Supabase's `auth` schema and roles, and the Supabase repository is type-checked; run it against a real project before relying on it. The Claude loop is type-checked and its fallback is tested; it needs an API key to exercise live.
- **Brand carry-overs.** Transaction IDs keep the `UF-2026-…` format (generated by the backend sequence and asserted in tests), and internal identifiers (the `UNIFLOW_*` env vars, memory-store keys) are unchanged so the rebrand touches no logic.
- **Bank setup checklist** steps are marked done by the student (**Mark done**); there is no document upload.
