import { z } from "zod";
import type { ActionContext } from "../audit";
import { audit } from "../audit";
import {
  COUNTRY_CODES,
  CURRENCIES,
  LOCALES,
  PermissionLevel,
  RESIDENCY_STATUSES,
  STUDENT_STATUSES,
  SUPPORTED_COUNTRIES,
  VISA_TYPES,
  type CountryCode,
  type SupportedCountry,
} from "../types";
import { checkRegulation } from "../regulatory/service";
import { localizeBank, localizeCredit, localizeRequirements } from "../reference/localize";
import { bankingGuidance, createActionPlan } from "../banking/service";
import { latestAnalysis } from "../statements/service";
import { formatMoney } from "../fx/service";
import type { BankingProfile } from "../banking/eligibility";
import type { ToolDef } from "./tools";
import type { StatementAnalysis } from "../statements/analyse";

/**
 * Tools for the global student journey: regulation, banking abroad, credit systems, the setup plan,
 * statement analysis and language. Same rules as the core registry: every fact comes from a
 * structured source, each tool declares its permission level, and the registry enforces it.
 */

// Local helper (importing the one in tools.ts would create a circular import).
const def = <S extends z.ZodType>(d: ToolDef<S>) => d;

const country = z.enum(COUNTRY_CODES);
const supported = z.enum(SUPPORTED_COUNTRIES);
/** Details the user stated in the conversation. They override the saved profile for this answer only. */
const persona = {
  nationality: country.optional().describe("The person's nationality, if they said it."),
  visa_type: z.enum(VISA_TYPES as [string, ...string[]]).optional(),
  residency_status: z.enum(RESIDENCY_STATUSES as [string, ...string[]]).optional(),
  student_status: z.enum(STUDENT_STATUSES as [string, ...string[]]).optional(),
  age: z.number().int().min(13).max(120).optional(),
  use_profile: z
    .boolean()
    .default(true)
    .describe("Set false when the user describes a different situation from their saved profile (a planned move, or asking for someone else); then only the details they gave are used."),
};

type Persona = { nationality?: CountryCode; visa_type?: string; residency_status?: string; student_status?: string; age?: number; use_profile?: boolean };

function personaOverride(p: Persona): Partial<BankingProfile> {
  const base: Partial<BankingProfile> =
    p.use_profile === false ? { nationality: null, visa_type: null, residency_status: null, student_status: null, age: null, tax_residency: null } : {};
  const set: Partial<BankingProfile> = {};
  if (p.nationality) set.nationality = p.nationality;
  if (p.visa_type) set.visa_type = p.visa_type as BankingProfile["visa_type"];
  if (p.residency_status) set.residency_status = p.residency_status as BankingProfile["residency_status"];
  if (p.student_status) set.student_status = p.student_status as BankingProfile["student_status"];
  if (p.age) set.age = p.age;
  return { ...base, ...set };
}

const brief = (a: StatementAnalysis) => ({
  currency: a.currency,
  period: a.period,
  totals: a.totals,
  categories: a.categories.slice(0, 8).map((c) => ({ category: c.category, amount: c.amount, share: Math.round(c.share * 100) })),
  recurring: a.recurring.map((r) => ({ merchant: r.merchant, monthly_cost: r.monthly_cost, subscription: r.is_subscription })),
  unusual: a.unusual.map((u) => ({ merchant: u.merchant, amount: u.amount, date: u.date })),
  opportunity: a.opportunity,
  pressure: a.pressure,
  is_estimate: true,
});

export const GLOBAL_TOOLS = [
  def({
    name: "getUserFinancialProfile",
    description:
      "Get the user's cross-border profile: nationality, home and study country, age, student status, visa type, residency, tax residency, language, and which of these are missing. Missing details must be asked for, never assumed.",
    level: PermissionLevel.Read,
    phase: "Understand",
    loading: "Reading your financial profile…",
    llm: true,
    schema: z.object({}),
    async run(ctx) {
      const p = await ctx.repo.getProfile();
      const fields = { nationality: p.nationality, home_country: p.home_country, study_country: p.study_country, age: p.age, student_status: p.student_status, visa_type: p.visa_type, residency_status: p.residency_status, tax_residency: p.tax_residency, language: p.language };
      const missing = Object.entries(fields).filter(([, v]) => v == null).map(([k]) => k);
      await audit(ctx, "PROFILE_READ", { tool: "getUserFinancialProfile", details: { missing } });
      return { data: { ...fields, missing }, summary: missing.length ? `Profile read · missing: ${missing.join(", ")}` : "Profile read · complete" };
    },
  }),
  def({
    name: "getCountryBankingRequirements",
    description: "Get researched, sourced guidance on opening a bank account in a study country (SG, GB, US, JP, CN): typical documents and eligibility factors, with sources and last-verified date.",
    level: PermissionLevel.Information,
    phase: "Understand",
    loading: "Retrieving account requirements…",
    llm: true,
    schema: z.object({ country: supported }),
    async run(ctx, input) {
      const lang = (await ctx.repo.getProfile()).language;
      const found = (await ctx.repo.listAccountRequirements()).find((r) => r.country === input.country);
      const req = found ? localizeRequirements(found, lang) : null;
      await audit(ctx, "BANK_REQUIREMENTS_RETRIEVED", { tool: "getCountryBankingRequirements", level: PermissionLevel.Information, details: { country: input.country, sources: req?.sources ?? [] } });
      if (!req) return { data: { found: false, message: "No researched requirements on record for this country." }, summary: `${input.country}: no requirements on record` };
      return { data: req, summary: `${input.country}: ${req.typical_documents.length} typical documents · ${req.sources.length} sources` };
    },
  }),
  def({
    name: "getAvailableBanks",
    description: "List banks in a study country with what each bank's own site states about student accounts, international students, fees, documents and international transfers. null means not confirmed.",
    level: PermissionLevel.Information,
    phase: "Analyse",
    loading: "Looking up bank options…",
    llm: true,
    schema: z.object({ country: supported }),
    async run(ctx, input) {
      const lang = (await ctx.repo.getProfile()).language;
      const banks = (await ctx.repo.listBanks()).filter((b) => b.country === input.country).map((b) => localizeBank(b, lang));
      await audit(ctx, "BANK_OPTIONS_RETRIEVED", { tool: "getAvailableBanks", level: PermissionLevel.Information, details: { country: input.country, banks: banks.map((b) => b.id) } });
      return {
        data: banks.map(({ evidence_quote: _q, ...b }) => b),
        summary: `${banks.length} banks in ${input.country}`,
      };
    },
  }),
  def({
    name: "getBankEligibility",
    description:
      "Check which banks a student is likely to be eligible for in a study country, using only banks' stated requirements. Returns need_info and the missing fields when nationality, age, student status, visa or residency are unknown: ask the user for them instead of guessing.",
    level: PermissionLevel.Read,
    phase: "Check compliance",
    loading: "Checking bank eligibility…",
    llm: true,
    schema: z.object({ country: supported, ...persona }),
    async run(ctx, input) {
      const g = await bankingGuidance(ctx, { country: input.country as SupportedCountry, override: personaOverride(input as Persona) });
      const cards: import("./protocol").AgentCard[] = [{ kind: "banks", country: input.country as SupportedCountry, eligibility: g.eligibility, requirements: g.requirements }];
      return {
        data: {
          missing: g.eligibility.missing,
          banks: g.eligibility.banks.map((b) => ({ bank: b.bank.bank_name, account: b.bank.account_type, verdict: b.verdict, reasons: b.reasons.map((r) => r.code), official_url: b.bank.official_url })),
          note: "Only the bank decides. Requirements can vary by branch and customer.",
        },
        summary: g.eligibility.missing.length
          ? `Need: ${g.eligibility.missing.join(", ")}`
          : `${g.eligibility.banks.filter((b) => b.verdict === "likely_eligible").length} likely · ${g.eligibility.banks.filter((b) => b.verdict === "check_with_bank").length} check with bank`,
        cards,
      };
    },
  }),
  def({
    name: "getFundFlowRules",
    description:
      "Retrieve and evaluate cross-border money rules for a corridor and person from the regulatory database (FX controls, limits, documents, reporting, student provisions), with official sources and last-verified dates. Status is COMPLIANT, ACTION_REQUIRED, BLOCKED or NEEDS_VERIFICATION. Never state a rule this tool did not return; if it returns no rules, say: \"I couldn't verify this requirement from the current regulatory database.\"",
    level: PermissionLevel.Read,
    phase: "Check compliance",
    loading: "Checking cross-border rules…",
    llm: true,
    schema: z.object({
      source_country: country,
      destination_country: country,
      purpose: z.enum(["education", "personal"]).default("education"),
      amount: z.number().positive().optional(),
      currency: z.enum(CURRENCIES).optional(),
      ...persona,
    }),
    async run(ctx, input) {
      const p = input as typeof input & Persona;
      const result = await checkRegulation(
        ctx,
        {
          source_country: p.source_country,
          destination_country: p.destination_country,
          purpose: p.purpose,
          amount: p.amount ?? null,
          currency: p.currency ?? null,
          nationality: p.nationality,
          residency_status: p.residency_status as never,
          visa_type: p.visa_type as never,
          // A described persona (planned move, someone else) must not inherit the saved profile's details.
          use_profile: p.use_profile !== false,
        },
        "getFundFlowRules",
      );
      return {
        data: {
          status: result.status,
          unverified_message: result.unverified_message,
          missing_info: result.missing_info,
          documents: result.documents,
          findings: result.findings.map((f) => ({
            rule: f.rule.rule_name,
            summary: f.rule.rule_description,
            jurisdiction: f.jurisdiction,
            outcome: f.outcome,
            channel: f.rule.channel,
            limit: f.rule.limit_amount != null && f.rule.currency ? `${f.rule.currency} ${f.rule.limit_amount}` : null,
            applies_to: f.rule.applies_to,
            regulator: f.rule.regulator,
            official_source_url: f.rule.official_source_url,
            last_verified: f.rule.last_verified,
            status: f.rule.status,
          })),
        },
        summary: `${p.source_country}→${p.destination_country}: ${result.findings.length} rules · ${result.status}`,
        cards: [{ kind: "regulatory", result }],
      };
    },
  }),
  def({
    name: "getCreditSystemInfo",
    description: "Get how consumer credit reporting works in a study country (bureaus, what can contribute, why it matters, responsible habits, risks, notes for newcomers), from official sources. Never promise score changes, approvals or rates.",
    level: PermissionLevel.Information,
    phase: "Analyse",
    loading: "Looking up the local credit system…",
    llm: true,
    schema: z.object({ country: supported }),
    async run(ctx, input) {
      const lang = (await ctx.repo.getProfile()).language;
      const raw = (await ctx.repo.listCreditSystems()).find((c) => c.country === input.country);
      const info = raw ? localizeCredit(raw, lang) : null;
      await audit(ctx, "BANK_REQUIREMENTS_RETRIEVED", { tool: "getCreditSystemInfo", level: PermissionLevel.Information, details: { country: input.country, topic: "credit", sources: info?.sources ?? [] } });
      if (!info) return { data: { found: false }, summary: `${input.country}: no credit information on record` };
      return { data: info, summary: `${input.country}: ${info.bureaus.length} bureaus on record`, cards: [{ kind: "credit_info", info }] };
    },
  }),
  def({
    name: "getAccountSetupSteps",
    description: "Create (or refresh) the user's personalised Financial Setup plan for a study country from their saved profile: documents, bank account, transfer rules, receiving funds, tuition, recurring payments, credit history and restrictions. Records ACTION_PLAN_CREATED.",
    level: PermissionLevel.Prepare,
    phase: "Recommend",
    loading: "Building your setup plan…",
    llm: true,
    schema: z.object({ country: supported.optional() }),
    async run(ctx, input) {
      const j = await createActionPlan(ctx, input.country as SupportedCountry | undefined);
      return {
        data: { country: j.country, from: j.home_country, completed: j.completed, total: j.steps.length, steps: j.steps.map((s) => ({ step: s.key, done: s.done })), missing_profile_fields: j.eligibility.missing, transfer_status: j.inbound.status },
        summary: `${j.country} plan · ${j.completed}/${j.steps.length} done`,
        cards: [{ kind: "setup_plan", country: j.country, home: j.home_country, completed: j.completed, steps: j.steps.map((s) => ({ key: s.key, done: s.done })) }],
      };
    },
  }),
  def({
    name: "getRequiredDocuments",
    description: "List the documents needed for opening a bank account in a study country, or for a tuition transfer between two countries, from the researched requirements and rules (with sources).",
    level: PermissionLevel.Read,
    phase: "Understand",
    loading: "Collecting the documents you'll need…",
    llm: true,
    schema: z.object({ purpose: z.enum(["bank_account", "tuition_transfer"]), country: supported, source_country: country.optional(), ...persona }),
    async run(ctx, input) {
      const p = input as typeof input & Persona;
      if (p.purpose === "bank_account") {
        const lang = (await ctx.repo.getProfile()).language;
        const found = (await ctx.repo.listAccountRequirements()).find((r) => r.country === p.country);
        const req = found ? localizeRequirements(found, lang) : null;
        await audit(ctx, "BANK_REQUIREMENTS_RETRIEVED", { tool: "getRequiredDocuments", level: PermissionLevel.Information, details: { country: p.country, purpose: "bank_account" } });
        return { data: { documents: req?.typical_documents ?? [], sources: req?.sources ?? [], last_verified: req?.last_verified ?? null }, summary: `${req?.typical_documents.length ?? 0} documents for a bank account` };
      }
      const profile = await ctx.repo.getProfile();
      const result = await checkRegulation(
        ctx,
        { source_country: (p.source_country ?? profile.home_country) as CountryCode, destination_country: p.country, purpose: "education", nationality: p.nationality, residency_status: p.residency_status as never, visa_type: p.visa_type as never, use_profile: p.use_profile !== false },
        "getRequiredDocuments",
      );
      return { data: { documents: result.documents, status: result.status, sources: result.sources }, summary: `${result.documents.length} documents for the transfer` };
    },
  }),
  def({
    name: "analyseSpending",
    description: "Get the analysis of the user's most recently confirmed bank statement: totals, categories, recurring payments, unusual expenses, cash-flow projection. Returns found=false if no statement has been confirmed (suggest Budget → Analyse statement).",
    level: PermissionLevel.Read,
    phase: "Analyse",
    loading: "Reviewing your statement analysis…",
    llm: true,
    schema: z.object({}),
    async run(ctx) {
      const latest = await latestAnalysis(ctx.repo);
      await audit(ctx, "TRANSACTIONS_READ", { tool: "analyseSpending", details: { statement: latest ? latest.uploadId.slice(0, 8) : null } });
      if (!latest) return { data: { found: false }, summary: "No confirmed statement yet" };
      return { data: { found: true, ...brief(latest.analysis) }, summary: `Statement: spent ${formatMoney(latest.analysis.totals.expenses, latest.analysis.currency)}`, cards: [{ kind: "statement", analysis: latest.analysis }] };
    },
  }),
  def({
    name: "generateSavingsInsights",
    description: "Get neutral, pre-computed insights and the estimated savings opportunity from the confirmed statement analysis. Present the opportunity as an estimate, never as guaranteed savings; no investment advice.",
    level: PermissionLevel.Read,
    phase: "Recommend",
    loading: "Finding savings opportunities…",
    llm: true,
    schema: z.object({}),
    async run(ctx) {
      const latest = await latestAnalysis(ctx.repo);
      if (!latest) return { data: { found: false }, summary: "No confirmed statement yet" };
      const a = latest.analysis;
      return {
        data: { insights: a.insights.map((i) => ({ code: i.code, params: i.params, basis: i.basis })), estimated_opportunity: a.opportunity, wording: "Estimated opportunity, not guaranteed savings." },
        summary: `${a.insights.length} insights · opportunity ${formatMoney(a.opportunity.monthly, a.currency)}/month (estimate)`,
      };
    },
  }),
  def({
    name: "getLanguagePreference",
    description: "Get the user's interface and reply language (en, zh-CN or ja).",
    level: PermissionLevel.Read,
    phase: "Understand",
    loading: "Checking your language…",
    llm: true,
    schema: z.object({}),
    async run(ctx) {
      const p = await ctx.repo.getProfile();
      return { data: { language: p.language }, summary: `Language: ${p.language}` };
    },
  }),
  def({
    name: "updateLanguagePreference",
    description: "Change the user's interface and reply language. Only call this when the user explicitly asks to switch language.",
    level: PermissionLevel.Prepare,
    phase: "Understand",
    loading: "Switching language…",
    llm: true,
    schema: z.object({ language: z.enum(LOCALES) }),
    async run(ctx, input) {
      const before = (await ctx.repo.getProfile()).language;
      await ctx.repo.updateProfile({ language: input.language });
      await audit(ctx, "SETTINGS_CHANGED", { tool: "updateLanguagePreference", level: PermissionLevel.Prepare, details: { language: { from: before, to: input.language } } });
      return { data: { language: input.language }, summary: `Language: ${before} → ${input.language}`, cards: [{ kind: "language", language: input.language }] };
    },
  }),
];
