import "server-only";
import type { Repository } from "./data/repository";
import type { Account, ComplianceStatus, Obligation, PaymentExecution, Profile } from "./types";
import { FxService, roundMoney } from "./fx/service";
import { evaluateCompliance } from "./compliance/engine";
import { compareQuotes } from "./remittance/engine";
import { buildQuoteSet, pickSourceAccount, transactionTypeFor } from "./finance";
import { daysFromToday } from "./utils";

/**
 * Read-only view models for pages. These compute the same numbers as the agent's
 * tools but write no audit events, so browsing never pollutes the evidence trail.
 */
export type TuitionInsight =
  | { state: "none" }
  | { state: "paid"; obligation: Obligation; execution: PaymentExecution | null }
  | {
      state: "due";
      obligation: Obligation;
      days: number;
      source: Account | null;
      estimate: number;
      sufficient: boolean;
      routes: number;
      compliance: ComplianceStatus;
      best_provider: string | null;
      best_send: number | null;
      extra_vs_worst: number | null;
    };

export async function loadTuitionInsight(repo: Repository, profile: Profile, accounts: Account[], obligations: Obligation[], fx: FxService): Promise<TuitionInsight> {
  const ob = obligations.find((o) => o.kind === "tuition" && o.status !== "PAID") ?? obligations.find((o) => o.kind === "tuition");
  if (!ob) return { state: "none" };
  if (ob.status === "PAID") {
    const executions = await repo.listExecutions();
    return { state: "paid", obligation: ob, execution: executions.find((e) => e.id === ob.payment_execution_id) ?? executions[0] ?? null };
  }
  const source = pickSourceAccount(accounts, profile);
  const srcCcy = source?.currency ?? profile.home_currency;
  const estimate = roundMoney(ob.amount / fx.rate(srcCcy, ob.currency), srcCcy);
  const [set, rules] = await Promise.all([
    buildQuoteSet(repo, { source_currency: srcCcy, destination_currency: ob.currency, destination_amount: ob.amount }),
    repo.listCountryRules(),
  ]);
  const cmp = compareQuotes(set.quotes);
  const best = cmp.best ? set.delivery_quotes.find((d) => d.provider_id === cmp.best!.provider_id) : null;
  const compliance = evaluateCompliance(
    rules,
    {
      source_country: source?.country ?? profile.home_country,
      destination_country: ob.destination_country,
      transaction_type: transactionTypeFor(ob),
      source_amount: estimate,
      source_currency: srcCcy,
      documents_on_file: profile.documents_on_file,
    },
    fx,
  );
  return {
    state: "due",
    obligation: ob,
    days: daysFromToday(ob.due_date),
    source,
    estimate,
    sufficient: Boolean(source && source.balance >= (best?.source_amount ?? estimate)),
    routes: set.quotes.filter((q) => q.available).length,
    compliance: compliance.status,
    best_provider: cmp.best?.provider_name ?? null,
    best_send: best?.source_amount ?? null,
    extra_vs_worst: cmp.best && cmp.worst ? roundMoney(cmp.best.estimated_recipient_amount - cmp.worst.estimated_recipient_amount, ob.currency) : null,
  };
}

export function totalIn(accounts: Account[], fx: FxService, currency: Profile["base_currency"]) {
  return roundMoney(accounts.reduce((s, a) => s + fx.convert(a.balance, a.currency, currency), 0), currency);
}
