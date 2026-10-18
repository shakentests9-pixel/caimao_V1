# Execution evidence

These files are the real output of CaiMao's main workflows, run end to end on 18 October 2026. The run used the app in sandbox demo mode, as the demo student Alex Tan, with the built-in planner (no model key). All data is fictional and no real money moved.

| File | What it is |
| --- | --- |
| [`caimao-evidence-export.json`](caimao-evidence-export.json) | The app's own export (**Activity & Security → Export**): the sandbox execution receipt, transfer requests, statement metadata (no transactions; the file itself is never stored) and every audit event |
| [`run-log.json`](run-log.json) | What each workflow returned: tools called, statuses, sources, reply excerpts |
| [`activity-and-security.png`](activity-and-security.png) | The Activity & Security page after the run |

To reproduce, start the app locally in demo mode (`npm run dev`), then run:

```bash
python3 scripts/evidence/run-workflows.py docs/execution-evidence http://localhost:3000
```

## What the run shows

Each run has its own ID. Audit events are listed in order and every event records the actor, the tool, the permission level and the result.

**1. Statement upload → analysis → recommendation** (`st-…`)

```
STATEMENT_UPLOADED (user, L1, consent given) → STATEMENT_PARSED → TRANSACTIONS_EXTRACTED
→ TRANSACTIONS_CONFIRMED (user) → SPENDING_ANALYSED
```

- **Result:** 92 transactions. Income GBP 4,492.00, expenses GBP 4,687.83, net −GBP 195.83, 10 recurring payments.
- **Estimated opportunity:** GBP 135.45 a month, from eating out above the earlier months' average. The one-off laptop purchase is flagged as an unusual expense and excluded from the estimate.
- **Balances:** unchanged. The assistant then explained the analysis using `analyseSpending` and `generateSavingsInsights`.

**2. Nationality + study country → eligibility → banks → setup plan** (`wf-…`, `bk-…`, `fs-…`)

- **Assistant** (*I'm a Chinese student moving to Singapore…*): `BANK_REQUIREMENTS_RETRIEVED → BANK_OPTIONS_RETRIEVED → PROFILE_READ → CLARIFICATION_REQUESTED`. CaiMao asked for visa and residency instead of assuming eligibility.
- **Banking Abroad** with the saved profile: `PROFILE_READ → BANK_REQUIREMENTS_RETRIEVED → BANK_OPTIONS_RETRIEVED → ELIGIBILITY_CHECKED`.
- **Setup plan:** `ACTION_PLAN_CREATED` (Level 2), 8 steps, 4 already done from the student's data.

**3. Source + destination → rules → requirements** (`rg-…`)

- **China → Singapore, education, USD 30,000:** `RULE_QUERY → RULE_RETRIEVED → RULE_EVALUATED → RESULT_PRESENTED`. The result is **COMPLIANT**, citing 14 official sources (State Administration of Foreign Exchange, Monetary Authority of Singapore and others), each last verified on 2026-10-18.
- **Vietnam → Japan:** **NEEDS VERIFICATION**, with *"I couldn't verify this requirement from the current regulatory database."* Vietnam isn't covered, so CaiMao invented nothing. It still showed the 7 verified Japan-side rules.

**4. Tuition: compare → check rules → prepare → approve → execute → verify** (`wf-…`)

```
PROFILE_READ → OBLIGATIONS_READ → ACCOUNTS_READ → FX_RATE_READ → TRANSFER_RULE_CHECK → COST_CALCULATION
→ TRANSFER_RULE_CHECK (re-checked on the server) → TRANSFER_PREPARED (agent, L2)
→ USER_APPROVAL (user, L3, acknowledged) → TRANSFER_EXECUTED → BALANCE_UPDATED → OBLIGATION_PAID
```

- **Receipt:** `UF-2026-000184`, COMPLETED. SGD 26,105.57 sent and GBP 15,000.00 received by Example University Treasury via Panda Remit Demo, fee SGD 15.00.
- **Approval:** the agent prepared the transfer; only the student's approval executed it.
