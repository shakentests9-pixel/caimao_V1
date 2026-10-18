import "server-only";
import type { ActionContext } from "../audit";
import { audit } from "../audit";
import { getFxService } from "../finance";
import { PermissionLevel, type CountryCode, type Currency, type ResidencyStatus, type VisaType } from "../types";
import { evaluateRegulation, type RegulatoryQuery, type RegulatoryResult } from "./engine";

export interface RegulationRequest {
  source_country: CountryCode;
  destination_country: CountryCode;
  purpose: "education" | "personal";
  amount?: number | null;
  currency?: Currency | null;
  /** Explicit values override the profile ("I'm asking for a friend" / "what if"). */
  nationality?: CountryCode | null;
  residency_status?: ResidencyStatus | null;
  visa_type?: VisaType | null;
  /** Use the signed-in user's profile and documents to fill gaps (Level 1 read). */
  use_profile?: boolean;
}

/**
 * getTransferRules / getFundFlowRules: the audited regulatory workflow.
 *   PROFILE_READ → RULE_QUERY → RULE_SOURCE_RETRIEVED → RULE_EVALUATED → (CLARIFICATION_REQUESTED) → RESULT_PRESENTED
 * Only structured rules are used. Personal details are logged as "provided / not provided", never their values.
 */
export async function checkRegulation(ctx: ActionContext, req: RegulationRequest, tool = "getFundFlowRules"): Promise<RegulatoryResult> {
  const useProfile = req.use_profile !== false;
  const [rules, fx, profile] = await Promise.all([ctx.repo.listCountryRules(), getFxService(ctx.repo), useProfile ? ctx.repo.getProfile() : Promise.resolve(null)]);
  const level = useProfile ? PermissionLevel.Read : PermissionLevel.Information;
  if (profile) await audit(ctx, "PROFILE_READ", { tool, level, details: { fields: ["nationality", "residency_status", "visa_type", "documents_on_file"] } });

  const pick = <T,>(explicit: T | null | undefined, fromProfile: T | null | undefined) => (explicit !== undefined ? explicit : fromProfile ?? null);
  const query: RegulatoryQuery = {
    source_country: req.source_country,
    destination_country: req.destination_country,
    purpose: req.purpose,
    amount: req.amount ?? null,
    currency: req.currency ?? null,
    nationality: pick(req.nationality, profile?.nationality),
    residency_status: pick(req.residency_status, profile?.residency_status),
    visa_type: pick(req.visa_type, profile?.visa_type),
    student_status: profile?.student_status ?? null,
    documents_on_file: profile?.documents_on_file ?? [],
  };
  const corridor = `${query.source_country}→${query.destination_country}`;
  await audit(ctx, "RULE_QUERY", {
    tool,
    level,
    details: {
      corridor,
      purpose: query.purpose,
      amount: query.amount && query.currency ? `${query.currency} ${query.amount}` : null,
      nationality: query.nationality ? "provided" : "not provided",
      residency_status: query.residency_status ? "provided" : "not provided",
      visa_type: query.visa_type ? "provided" : "not provided",
    },
  });

  const result = evaluateRegulation(rules, query, fx);
  await audit(ctx, "RULE_SOURCE_RETRIEVED", {
    tool,
    level,
    details: { rules: result.findings.map((f) => f.rule.id), sources: result.sources.map((s) => ({ regulator: s.regulator, url: s.url, last_verified: s.last_verified })) },
  });
  await audit(ctx, "RULE_EVALUATED", {
    tool,
    level,
    result: result.status === "BLOCKED" ? "BLOCKED" : "SUCCESS",
    details: { status: result.status, outcomes: result.findings.map((f) => ({ id: f.rule.id, outcome: f.outcome })), coverage: result.coverage },
  });
  if (result.missing_info.length) await audit(ctx, "CLARIFICATION_REQUESTED", { tool, level, details: { missing: result.missing_info } });
  await audit(ctx, "RESULT_PRESENTED", {
    tool,
    level,
    details: { status: result.status, sources: result.sources.length, unverified: !!result.unverified_message },
  });
  return result;
}
