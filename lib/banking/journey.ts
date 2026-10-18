import type {
  Account,
  AccountRequirements,
  BankProduct,
  CountryCode,
  CountryRule,
  CreditCard,
  CreditSystemInfo,
  FinancialSetupProgress,
  Obligation,
  Profile,
  SupportedCountry,
} from "../types";
import { SUPPORTED_COUNTRIES } from "../types";
import type { FxService } from "../fx/service";
import { bankingProfileFrom, checkEligibility, type EligibilityResult } from "./eligibility";
import { evaluateRegulation, isAssistantRule, type RegulatoryResult } from "../regulatory/engine";

/**
 * "My Financial Setup": a personalised journey for moving to a study country.
 * The step list is a fixed template; everything inside a step (documents, banks, rules,
 * credit information) is pulled from the researched reference tables, never written here.
 * Steps complete automatically when CaiMao can see the evidence, or when the student ticks them.
 */

export const STEP_KEYS = [
  "documents",
  "open_account",
  "debit_card",
  "transfer_rules",
  "receive_funds",
  "pay_tuition",
  "recurring",
  "credit",
  "restrictions",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export interface JourneyStep {
  key: StepKey;
  done: boolean;
  /** "auto" when CaiMao can see it's done (e.g. a local account exists), "user" when ticked. */
  done_by: "auto" | "user" | null;
  /** Data for the step body; the UI renders it in the user's language. */
  data: Record<string, unknown>;
}

export interface Journey {
  country: SupportedCountry;
  home_country: CountryCode;
  steps: JourneyStep[];
  completed: number;
  eligibility: EligibilityResult;
  inbound: RegulatoryResult;
  credit: CreditSystemInfo | null;
  requirements: AccountRequirements | null;
}

export interface JourneyInput {
  profile: Profile;
  country?: SupportedCountry;
  rules: CountryRule[];
  banks: BankProduct[];
  requirements: AccountRequirements[];
  credit: CreditSystemInfo[];
  progress: FinancialSetupProgress[];
  accounts: Account[];
  obligations: Obligation[];
  cards: CreditCard[];
  fx: FxService;
}

export function isSupported(c: string): c is SupportedCountry {
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(c);
}

export function buildJourney(input: JourneyInput): Journey {
  const { profile } = input;
  const country = input.country ?? (isSupported(profile.study_country) ? profile.study_country : "GB");
  const home = profile.home_country;
  const ticked = new Map(input.progress.filter((p) => p.country === country && !p.step_key.startsWith("bank:")).map((p) => [p.step_key, p.completed]));
  const requirements = input.requirements.find((r) => r.country === country) ?? null;
  const credit = input.credit.find((c) => c.country === country) ?? null;
  const eligibility = checkEligibility(input.banks, bankingProfileFrom(profile, { destination: country }));

  // Money coming from home into the study country, for education.
  const inbound = evaluateRegulation(input.rules, {
    source_country: home,
    destination_country: country,
    purpose: "education",
    nationality: profile.nationality,
    residency_status: profile.residency_status,
    visa_type: profile.visa_type,
    student_status: profile.student_status,
    documents_on_file: profile.documents_on_file,
  }, input.fx);

  const localAccount = input.accounts.find((a) => a.country === country && a.kind === "bank");
  const chosenId = input.progress.find((p) => p.country === country && p.step_key.startsWith("bank:") && p.completed)?.step_key.slice(5) ?? null;
  const chosenBank = chosenId ? input.banks.find((b) => b.id === chosenId) ?? null : null;
  const tuition = input.obligations.find((o) => o.kind === "tuition" && o.destination_country === country);
  const recurring = input.obligations.filter((o) => o.kind === "rent" || o.kind === "other" || o.kind === "card");
  const localCard = input.cards.find((c) => c.currency === localAccount?.currency);
  const restrictions = input.rules.filter(
    (r) => isAssistantRule(r) && (r.source_country === country || r.destination_country === country || r.source_country === home) &&
      ["fx_control", "limit", "tax", "reporting"].includes(r.rule_category ?? ""),
  );

  const auto: Partial<Record<StepKey, boolean>> = {
    documents: profile.documents_on_file.length >= 2,
    open_account: !!localAccount,
    debit_card: false,
    transfer_rules: false,
    receive_funds: !!localAccount && input.accounts.some((a) => a.country === home),
    pay_tuition: tuition?.status === "PAID",
    recurring: false,
    credit: !!localCard,
    restrictions: false,
  };

  const data: Record<StepKey, Record<string, unknown>> = {
    documents: { documents: requirements?.typical_documents ?? [], on_file: profile.documents_on_file, sources: requirements?.sources ?? [], last_verified: requirements?.last_verified ?? null },
    open_account: {
      likely: eligibility.banks.filter((b) => b.verdict === "likely_eligible").map((b) => b.bank.bank_name),
      check: eligibility.banks.filter((b) => b.verdict === "check_with_bank").map((b) => b.bank.bank_name),
      missing: eligibility.missing,
      account: localAccount ? { name: localAccount.name, last4: localAccount.account_last4 } : null,
      chosen: chosenBank ? { id: chosenBank.id, name: chosenBank.bank_name, account_type: chosenBank.account_type, url: chosenBank.official_url } : null,
    },
    debit_card: { has_account: !!localAccount },
    transfer_rules: { status: inbound.status, rules: inbound.findings.length, sources: inbound.sources.length },
    receive_funds: { from: home, to: country, documents: inbound.documents.map((d) => d.name) },
    pay_tuition: tuition ? { title: tuition.title, amount: tuition.amount, currency: tuition.currency, status: tuition.status, due_date: tuition.due_date } : {},
    recurring: { items: recurring.filter((o) => o.status !== "PAID").map((o) => ({ title: o.title, amount: o.amount, currency: o.currency })) },
    credit: { has_bureau: credit?.has_formal_bureau ?? null, bureaus: credit?.bureaus ?? [], has_card: !!localCard },
    restrictions: { rules: restrictions.map((r) => ({ id: r.id, name: r.rule_name, category: r.rule_category, regulator: r.regulator, url: r.official_source_url })) },
  };

  const steps: JourneyStep[] = STEP_KEYS.map((key) => {
    const user = ticked.get(key);
    const autoDone = !!auto[key];
    return { key, done: autoDone || !!user, done_by: autoDone ? "auto" : user ? "user" : null, data: data[key] };
  });

  return { country, home_country: home, steps, completed: steps.filter((s) => s.done).length, eligibility, inbound, credit, requirements };
}
