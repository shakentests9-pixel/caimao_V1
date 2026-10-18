# CaiMao security self-assessment

**Scope.** This assessment covers the CaiMao web app as submitted:

- the tuition payment workflow;
- bank statement analysis;
- the cross-border rules assistant;
- Banking Abroad and My Financial Setup;
- language support;
- the AI agent;
- the Supabase and demo data stores.

**Environment.** CaiMao is a **sandbox**. No real money moves and no real bank is contacted. Reference data was researched on 18 October 2026.

**Method.** We reviewed the code paths in the [technical documentation](technical-documentation.md), wrote automated tests for each control (listed in section 9), ran the app end to end and captured the [execution evidence](execution-evidence/README.md).

---

## 1. What we protect

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Money movement (sandbox balances, obligations) | `accounts`, `transfer_requests`, `payment_executions` | A payment without consent, or to the wrong recipient |
| Bank statement contents | Parsed in memory; confirmed rows in `statement_transactions` | Highly personal financial history |
| Personal profile | `profiles`: nationality, visa, residency, age, student and tax status, language | Sensitive personal data, used for guidance |
| Regulatory and bank guidance | `country_rules`, `banks`, `bank_account_requirements`, `credit_system_rules` | Wrong or invented rules could mislead a student |
| Audit trail | `audit_logs` (append-only) | Evidence of what happened and who approved it |
| Secrets | Server environment (Anthropic key, Supabase service role, session secret) | Account takeover or cost abuse |

## 2. Permission tiers

| Level | What CaiMao may do | Tools | How it's enforced |
| --- | --- | --- | --- |
| **0 Information** | General and reference information | FX rate, cost calculation, banking requirements, bank options, credit system | Reference data only; no personal data |
| **1 Read** | Read the user's own profile, accounts, transactions, statements and setup progress | Accounts, transactions, transfer rules, financial profile, fund-flow rules, eligibility, documents, spending analysis, insights, language; statement parsing and classification (upload flow only, after consent) | Row-level security (owner reads only); tools scoped to the signed-in user |
| **2 Prepare** | Create something the user acts on; nothing moves | Prepare a transfer, create the setup plan, change the language on request | `assertPermission`: allowed only up to the user's chosen level (Settings → *How CaiMao can help*); otherwise refused and logged as `PERMISSION_DENIED` |
| **3 Execute** | Move money, **once per approved transaction** | Sandbox execution, balance update, mark obligation paid | **Never available to the model.** Reached only via `POST /api/transfers/:id/confirm`. The server requires `acknowledged: true` from the user. Compare-and-set state allows one approval and one execution. The database function `commit_sandbox_execution` and the constraints `approval_requires_ack` and `no_execution_when_blocked` re-check approval, acknowledgement and compliance |

Level 3 can never be a standing permission: `assertPermission` refuses any agent tool above Level 2, whatever the setting. A prepared transfer expires after 15 minutes if it isn't approved.

## 3. Human approval

- The review screen shows exactly what will happen: amount sent and received, recipient, account, provider, fee, rate against mid-market, arrival time, requirements and documents.
- **Confirm & Pay** stays disabled until the student ticks *I reviewed this transfer*.
- The server checks the acknowledgement again, and re-evaluates funds and rules when preparing the transfer.
- Declined, expired or blocked requests can't be executed (tested).
- Nothing else in the new features moves money:
  - a statement import never changes balances or the main ledger (tested);
  - a setup plan is a checklist;
  - a rules check is read-only.

## 4. Privacy

### 4.1 Bank statements

| Control | Implementation |
| --- | --- |
| Explicit consent | A consent checkbox is required. The API refuses an upload without `consent=true` (`CONSENT_REQUIRED`) and logs the refusal |
| No banking credentials | CaiMao never asks for or accepts a bank login. The upload screen says so |
| File type validation | Checks magic bytes as well as the extension. Only PDF and CSV are accepted. Archives (including XLSX/DOCX), executables, gzip and other binaries are rejected. PDFs that are encrypted or contain `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile` or `/RichMedia` are refused |
| Size limit | 5 MB, checked from `Content-Length` before the body is read and again on the bytes. The database has a check constraint too |
| Server-side parsing | Parsed in memory inside the route handler. `unpdf` runs as a server-external package. No client-side parsing |
| No stored file, no public URL | The file is never written to disk or storage. `statement_uploads` has no file column. Only metadata and a SHA-256 hash are kept |
| Identifier masking | IBANs, card and account numbers become `••••1234` and email addresses are removed before anything is saved. Only a masked account hint is stored, and the database checks its format |
| Review before import | Rows are a preview until the student confirms. Previews expire after one hour and are purged |
| User-controlled deletion | **Delete** removes the upload, its rows and its analysis (`STATEMENT_DELETED`) |
| Balances untouched | A confirmed import feeds the analysis only (tested) |
| Isolation | Select-own RLS on all three statement tables, with no client write policies (tested in SQL and in the repository) |

### 4.2 What the AI model sees

| Feature | Data sent to the model | Not sent |
| --- | --- | --- |
| Optional category suggestions (only with an API key) | For card-style **debits** the classifier couldn't place: index, masked merchant name and direction | Amounts, dates, balances, account numbers, descriptions. **Credits and person-to-person or own-account transfers** are excluded so no one's name is sent (tested in `privacy.test.ts`) |
| Assistant: statement questions | Aggregates from the confirmed analysis: totals, top categories, recurring and unusual payments (merchant, amount, date), the estimated opportunity | Raw rows, the file, account numbers, income sender names |
| Assistant: profile | Countries, currencies, nationality, residency, visa, age, student status and language, as needed | Email, credentials, full account numbers (stripped from `getUserProfile`) |
| Rules and banking | The structured result returned by the tool | — |

Without `ANTHROPIC_API_KEY` nothing goes to a model; the built-in planner runs the same tools locally.

### 4.3 Personal profile and logs

- Nationality, visa, residency, age and tax residency are optional. Banking and rules guidance asks for them when needed instead of assuming.
- Audit events record **that** a personal field was provided or updated, not its value. For example, `RULE_QUERY` logs `nationality: "provided"`.

## 5. Regulatory integrity (no hallucinated rules)

| Risk | Control |
| --- | --- |
| The model invents a rule | Rules come only from the structured `country_rules` table, through `getTransferRules` / `getFundFlowRules`. The system prompt forbids stating rules no tool returned. The built-in planner writes replies only from tool results |
| An unverified or missing rule is treated as an answer | `NEEDS_VERIFICATION` whenever any of these holds: nothing verified matched; a side of the corridor has no verified rule; required personal details are missing; or an unverified rule could gate the payment. The exact sentence *"I couldn't verify this requirement from the current regulatory database."* is shown and the uncovered countries are named (tested) |
| A rule without a source | A database check rejects a `verified` rule with no https source or last-verified date. A test checks every researched rule and bank |
| Stale data | Every answer shows its source and last-verified date. See known risk R2 |
| Eligibility invented | Only facts stated on the bank's own page are used. An unconfirmed fact gives *check with the bank*. Missing personal details make CaiMao ask (`CLARIFICATION_REQUESTED`) |
| Credit promises | Credit guidance is stored and shown hedged ("may help", "can contribute"). A fixed disclaimer says nothing guarantees a higher score, an approval or a better rate |
| Rules in the UI | No regulation is hard-coded in React components. Components render engine results |

## 6. Audit and execution evidence

Every workflow step writes an audit event with actor, action, tool, permission level, result, details and run ID:

- **Statement:** `STATEMENT_UPLOADED → STATEMENT_PARSED → TRANSACTIONS_EXTRACTED → TRANSACTIONS_CONFIRMED → SPENDING_ANALYSED` (+ `TRANSACTION_RECATEGORISED`, `STATEMENT_DELETED`)
- **Regulation:** `RULE_QUERY → RULE_RETRIEVED → RULE_EVALUATED → (CLARIFICATION_REQUESTED) → RESULT_PRESENTED`
- **Banking:** `BANK_REQUIREMENTS_RETRIEVED → BANK_OPTIONS_RETRIEVED → ELIGIBILITY_CHECKED` (or `CLARIFICATION_REQUESTED`) `→ ACTION_PLAN_CREATED`
- **Payment:** `TRANSFER_RULE_CHECK → QUOTE_RETRIEVAL → COST_CALCULATION → TRANSFER_PREPARED → USER_APPROVAL → TRANSFER_EXECUTED → BALANCE_UPDATED → OBLIGATION_PAID`

How the trail is protected and exported:

- In Supabase, a trigger rejects `UPDATE` and `DELETE` on `audit_logs`.
- **Activity & Security → Export** downloads executions, transfer requests, statement metadata (no transactions) and the full audit log as JSON.

## 7. Platform security

- **Sessions.**
  - Supabase Auth, or in demo mode an HMAC-SHA256 signed cookie (`httpOnly`, `SameSite=Lax`, `Secure` on HTTPS, 12-hour expiry, constant-time comparison).
  - `proxy.ts` protects every page and API except the public welcome, login and locale routes. Every handler resolves the user again.
- **Input validation.** zod on every route and tool input, with length and size limits.
- **Secrets.** Read only on the server. Server modules import `server-only`. Nothing secret is prefixed `NEXT_PUBLIC_`.
- **Headers.** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and a strict referrer policy.
- **Database.**
  - RLS on every table; no client write policies on money or statement tables.
  - Column grants limit what a user can change on their profile.
  - `ai_permission_level` is capped at 2 by a check constraint.

## 8. Known risks

| # | Risk | Likelihood / impact | Mitigation in place | Residual / recommendation |
| --- | --- | --- | --- | --- |
| R1 | **Shared demo account.** In demo mode (no Supabase) every visitor signs in as the same demo student, so anything one visitor uploads is visible to the next. On serverless hosts the demo store can also reset | High in a public demo / medium | The upload screen shows a notice in demo mode: use the sample or a made-up statement. One-click sample statement. Statements can be deleted. Demo mode is meant for presenting | Use Supabase mode (per-user accounts with RLS) for anything beyond a presentation |
| R2 | **Regulations and bank terms change.** Data was verified on 18 Oct 2026 and isn't re-verified automatically | Medium / medium | Every answer shows its source link and last-verified date. Wording is "appears", "may". `NEEDS_VERIFICATION` covers gaps. Banks and regulators make the final decision | Schedule re-verification. Flag rules older than N months as needing verification |
| R3 | **Translation accuracy.** Chinese and Japanese UI and rule texts were AI-translated and checked mechanically (keys, placeholders, numbers, URLs), not by a native legal reviewer | Medium / medium | English is the source of truth. Official sources are linked. Numbers and proper nouns are preserved. Document names inside rules stay in English | Native-speaker review of the regulatory texts before production |
| R4 | **Rule modelling is a simplification.** Real rules have exceptions that a structured record can't fully capture | Medium / medium | Conditions, exceptions and considerations are kept as text alongside the structured fields. Disclaimers. Simulated payment-gating rules are labelled as such | Expert review. More `needs_verification` where nuance matters |
| R5 | **Eligibility heuristics.** A "likely eligible" verdict may not match a bank's decision | Medium / low | Only stated facts are used. Unconfirmed facts give *check with the bank*. Every bank card says only the bank decides | — |
| R6 | **Prompt injection through data.** A merchant name in a statement could contain instructions | Low / low | The model has no money-moving tool. Tool inputs are zod-validated. Category suggestions are limited to a fixed list and stay flagged for review. Payment approval is human. Statement text reaches the model only as short merchant names | Keep high-impact actions human-approved |
| R7 | **PDF parser attack surface.** A crafted PDF could exploit pdf.js | Low / medium | Size limit, magic-byte check, encrypted and script-bearing PDFs refused, parsing in a server function with no file persistence | Run parsing in an isolated worker with a time limit; keep `unpdf` updated |
| R8 | **No rate limiting** on the upload and agent endpoints | Medium / low (cost, availability) | Size limit. Request bodies validated. Agent conversations capped (≤ 40 messages, ≤ 4,000 characters each, ≤ 14 tool steps) | Add per-user rate limits (e.g. at the edge) before a public launch |
| R9 | **Confirmed statement data persists until the user deletes it** | Low / medium | Delete control; RLS; only masked identifiers stored | Add an automatic retention period for confirmed statements |
| R10 | **Sandbox only.** There is no real KYC/AML, sanctions screening or provider integration | — | Clearly labelled sandbox. Execution is gated and audited | Real providers would supply KYC/AML and sanctions checks |
| R11 | **Supabase and Claude paths exercised less live than demo mode** | Low / medium | SQL tested in PGlite; the Supabase repository is type-checked; Claude fallback tested | Run the suite against a staging Supabase project with a live key |

## 9. Evidence that controls work

| Control | Test |
| --- | --- |
| No payment without approval; agent can't approve or execute; declined or expired requests can't execute | `tuition-workflow.test.ts`, `global-setup.test.ts` (TEST 13) |
| Permission levels and `PERMISSION_DENIED`; new tools declare levels; the setup plan is Level 2 | `tuition-workflow.test.ts`, `global-setup.test.ts` |
| RLS, append-only audit, atomic commit, statement table isolation, verified-rule source check | `sql.test.ts`, `global-setup.test.ts` (TEST 12) |
| Consent required; invalid or oversized files fail safely and store nothing; review before import; balances unchanged; deletion; preview expiry | `statements.test.ts` (TESTS 1–4 and more) |
| Minimal data to the AI model | `privacy.test.ts` |
| NEEDS_VERIFICATION and the exact sentence; sources and last-verified dates; clarification instead of assumptions | `global-setup.test.ts` (TESTS 5–8) |
| Tuition workflow unchanged with the new data | `global-setup.test.ts` (TEST 14) |
| Language persists; complete and valid translations; assistant understands all three languages | `global-setup.test.ts` (TESTS 9–11), `agent-i18n.test.ts` |

Live run: [execution-evidence/caimao-evidence-export.json](execution-evidence/caimao-evidence-export.json).

## 10. Before real-world use

1. Use Supabase mode only. Disable demo mode in production.
2. Add rate limiting and a retention period for confirmed statements.
3. Have a qualified reviewer check the regulatory data and its Chinese and Japanese translations, and set up regular re-verification.
4. Integrate a licensed payment provider for real execution, KYC/AML and sanctions screening; keep the approval gate.
5. Add a Content-Security-Policy header and isolate PDF parsing in a worker with a timeout.
