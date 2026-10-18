import "server-only";
import type { ActionContext } from "../audit";
import { audit } from "../audit";
import { getFxService } from "../finance";
import { PermissionLevel, type SupportedCountry } from "../types";
import { bankingProfileFrom, checkEligibility, type BankingProfile } from "./eligibility";
import { buildJourney, STEP_KEYS, type StepKey } from "./journey";
import { localizeBank, localizeCredit, localizeRequirements } from "../reference/localize";

/**
 * getCountryBankingRequirements / getAvailableBanks / getBankEligibility, audited:
 *   BANK_REQUIREMENTS_RETRIEVED → BANK_OPTIONS_RETRIEVED → ELIGIBILITY_CHECKED (or CLARIFICATION_REQUESTED)
 * and ACTION_PLAN_CREATED when the user asks CaiMao to make their setup plan (Level 2: prepare).
 */
export async function bankingGuidance(ctx: ActionContext, input: { country: SupportedCountry; override?: Partial<BankingProfile>; tool?: string }) {
  const tool = input.tool ?? "getBankEligibility";
  const [profile, rawBanks, rawReqs, rawCredit] = await Promise.all([ctx.repo.getProfile(), ctx.repo.listBanks(), ctx.repo.listAccountRequirements(), ctx.repo.listCreditSystems()]);
  // Display text in the user's language; flags and numbers used for eligibility are unchanged.
  const banks = rawBanks.map((b) => localizeBank(b, profile.language));
  const reqs = rawReqs.map((r) => localizeRequirements(r, profile.language));
  const credit = rawCredit.map((c) => localizeCredit(c, profile.language));
  await audit(ctx, "PROFILE_READ", { tool, level: PermissionLevel.Read, details: { fields: ["nationality", "age", "student_status", "visa_type", "residency_status"] } });
  const requirements = reqs.find((r) => r.country === input.country) ?? null;
  await audit(ctx, "BANK_REQUIREMENTS_RETRIEVED", {
    tool: "getCountryBankingRequirements",
    level: PermissionLevel.Information,
    details: { country: input.country, sources: requirements?.sources ?? [], last_verified: requirements?.last_verified ?? null },
  });
  const options = banks.filter((b) => b.country === input.country);
  await audit(ctx, "BANK_OPTIONS_RETRIEVED", {
    tool: "getAvailableBanks",
    level: PermissionLevel.Information,
    details: { country: input.country, banks: options.map((b) => ({ id: b.id, status: b.status, url: b.official_url })) },
  });
  const p = bankingProfileFrom(profile, { destination: input.country, ...input.override });
  const eligibility = checkEligibility(banks, p);
  if (eligibility.missing.length) {
    await audit(ctx, "CLARIFICATION_REQUESTED", { tool, level: PermissionLevel.Read, details: { missing: eligibility.missing } });
  } else {
    await audit(ctx, "ELIGIBILITY_CHECKED", {
      tool,
      level: PermissionLevel.Read,
      details: { country: input.country, verdicts: eligibility.banks.map((b) => ({ bank: b.bank.id, verdict: b.verdict })) },
    });
  }
  return { profile: p, requirements, eligibility, credit: credit.find((c) => c.country === input.country) ?? null };
}

export async function loadJourney(ctx: ActionContext, country?: SupportedCountry) {
  const [profile, rules, banks, requirements, credit, progress, accounts, obligations, cards, transfers, fx] = await Promise.all([
    ctx.repo.getProfile(),
    ctx.repo.listCountryRules(),
    ctx.repo.listBanks(),
    ctx.repo.listAccountRequirements(),
    ctx.repo.listCreditSystems(),
    ctx.repo.listSetupProgress(),
    ctx.repo.listAccounts(),
    ctx.repo.listObligations(),
    ctx.repo.listCreditCards(),
    ctx.repo.listTransferRequests(),
    getFxService(ctx.repo),
  ]);
  const l = profile.language;
  return buildJourney({
    profile, country, rules, progress, accounts, obligations, cards, transfers, fx,
    banks: banks.map((b) => localizeBank(b, l)),
    requirements: requirements.map((r) => localizeRequirements(r, l)),
    credit: credit.map((c) => localizeCredit(c, l)),
  });
}

/** getAccountSetupSteps + ACTION_PLAN_CREATED: the personalised plan, recorded in the evidence log. */
export async function createActionPlan(ctx: ActionContext, country?: SupportedCountry) {
  const journey = await loadJourney(ctx, country);
  await audit(ctx, "ACTION_PLAN_CREATED", {
    tool: "getAccountSetupSteps",
    level: PermissionLevel.Prepare,
    details: {
      country: journey.country,
      from: journey.home_country,
      steps: journey.steps.map((s) => ({ key: s.key, done: s.done })),
      likely_banks: journey.eligibility.banks.filter((b) => b.verdict === "likely_eligible").map((b) => b.bank.bank_name),
      transfer_status: journey.inbound.status,
      missing: journey.eligibility.missing,
    },
  });
  return journey;
}

/** The bank the student picked, stored as a setup-progress row "bank:<id>" (one per country). */
export async function chooseBank(ctx: ActionContext, country: SupportedCountry, bankId: string | null) {
  const banks = (await ctx.repo.listBanks()).filter((b) => b.country === country);
  if (bankId && !banks.some((b) => b.id === bankId)) throw new Error("Unknown bank");
  for (const p of await ctx.repo.listSetupProgress()) {
    if (p.country === country && p.step_key.startsWith("bank:") && p.completed && p.step_key !== `bank:${bankId}`) await ctx.repo.setSetupProgress(country, p.step_key, false);
  }
  if (bankId) await ctx.repo.setSetupProgress(country, `bank:${bankId}`, true);
  await audit(ctx, "SETUP_STEP_UPDATED", { level: PermissionLevel.Read, details: { country, chosen_bank: bankId } });
}

export async function setStep(ctx: ActionContext, country: SupportedCountry, step: StepKey, completed: boolean) {
  if (!(STEP_KEYS as readonly string[]).includes(step)) throw new Error("Unknown step");
  await ctx.repo.setSetupProgress(country, step, completed);
  await audit(ctx, "SETUP_STEP_UPDATED", { level: PermissionLevel.Read, details: { country, step, completed } });
}
