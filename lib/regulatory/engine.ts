import type {
  CountryCode,
  CountryRule,
  Currency,
  Profile,
  ResidencyStatus,
  StudentStatus,
  VisaType,
} from "../types";
import type { FxService } from "../fx/service";

/**
 * Regulatory retrieval + evaluation for the cross-border assistant.
 *
 * The language model never decides what a rule says. This module:
 *  1. retrieves only rules whose corridor, purpose and personal conditions match the query,
 *  2. evaluates them deterministically (limits, documents, reporting),
 *  3. returns a status, the findings and the official sources with last-verified dates.
 * If nothing verified matches, the status is NEEDS_VERIFICATION and the caller must say:
 * "I couldn't verify this requirement from the current regulatory database."
 */

export const UNVERIFIED_MESSAGE = "I couldn't verify this requirement from the current regulatory database.";

export type RegulatoryStatus = "COMPLIANT" | "ACTION_REQUIRED" | "BLOCKED" | "NEEDS_VERIFICATION";
export type MissingField = "nationality" | "residency_status" | "visa_type" | "amount";

export interface RegulatoryQuery {
  source_country: CountryCode;
  destination_country: CountryCode;
  purpose: "education" | "personal";
  amount?: number | null;
  currency?: Currency | null;
  nationality?: CountryCode | null;
  residency_status?: ResidencyStatus | null;
  visa_type?: VisaType | null;
  student_status?: StudentStatus | null;
  documents_on_file?: string[];
}

export type FindingOutcome = "PASS" | "DOCUMENTS" | "BLOCK" | "REPORT" | "INFO" | "UNVERIFIED" | "CONDITIONAL";

export interface Finding {
  rule: CountryRule;
  /** Which country's rule this is. */
  jurisdiction: CountryCode | "*";
  side: "sending" | "receiving" | "both";
  outcome: FindingOutcome;
  /** Message code + params, rendered in the user's language by the UI. */
  message: { code: FindingCode; params: Record<string, string | number> };
  documents: { name: string; on_file: boolean }[];
}

export type FindingCode =
  | "within_limit"
  | "over_limit"
  | "below_threshold"
  | "documents_needed"
  | "documents_ready"
  | "report_over_threshold"
  | "report_below_threshold"
  | "disclosure"
  | "unverified_rule"
  | "depends_on"
  | "cash_guidance";

export interface RegulatoryResult {
  status: RegulatoryStatus;
  query: RegulatoryQuery;
  coverage: { country: CountryCode; side: "sending" | "receiving"; verified_rules: number; unverified_rules: number }[];
  findings: Finding[];
  documents: { name: string; on_file: boolean }[];
  limits: { rule_id: string; text: string }[];
  considerations: { rule_id: string; text: string }[];
  sources: { regulator: string; url: string; last_verified: string; rule_ids: string[]; status: CountryRule["status"] }[];
  missing_info: MissingField[];
  /** Set when status is NEEDS_VERIFICATION because nothing (or nothing verified) matched. */
  unverified_message: string | null;
  /** Countries whose side of the transfer has no verified rule on record. */
  unverified_countries: CountryCode[];
  checked_at: string;
}

/** Rules used by the assistant: researched ones only. Simulated demo rules are excluded here. */
export const isAssistantRule = (r: CountryRule) => r.status === "verified" || r.status === "needs_verification";

const corridorMatch = (r: CountryRule, q: RegulatoryQuery) =>
  (r.source_country === q.source_country || r.source_country === "*") &&
  (r.destination_country === q.destination_country || r.destination_country === "*") &&
  // A rule must belong to one of the two countries; "* → *" rules would be global and none exist.
  (r.source_country === q.source_country || r.destination_country === q.destination_country) &&
  (r.transaction_type === "any" || r.transaction_type === q.purpose);

const directionMatch = (r: CountryRule, side: "sending" | "receiving") =>
  !r.direction || r.direction === "both" || (side === "sending" ? r.direction === "outbound" : r.direction === "inbound");

/** RULE_QUERY + RULE_RETRIEVED: the subset of rules relevant to this person and corridor. */
export function retrieveRules(rules: CountryRule[], q: RegulatoryQuery): { rule: CountryRule; side: Finding["side"]; conditional: MissingField[] }[] {
  const out: { rule: CountryRule; side: Finding["side"]; conditional: MissingField[] }[] = [];
  for (const r of rules) {
    if (!isAssistantRule(r) || !corridorMatch(r, q)) continue;
    const sending = r.source_country === q.source_country;
    const receiving = r.destination_country === q.destination_country;
    const side: Finding["side"] = sending && receiving ? "both" : sending ? "sending" : "receiving";
    if (side !== "both" && !directionMatch(r, side)) continue;

    // Personal conditions: a known mismatch excludes the rule; an unknown value makes it conditional.
    const conditional: MissingField[] = [];
    if (r.nationality_condition?.length) {
      if (!q.nationality) conditional.push("nationality");
      else if (!r.nationality_condition.includes(q.nationality)) continue;
    }
    if (r.residency_condition) {
      if (!q.residency_status) conditional.push("residency_status");
      else if (r.residency_condition !== q.residency_status) continue;
    }
    if (r.visa_condition?.length) {
      if (!q.visa_type) conditional.push("visa_type");
      else if (!r.visa_condition.includes(q.visa_type)) continue;
    }
    out.push({ rule: r, side, conditional });
  }
  return out;
}

const gates = (r: CountryRule) => r.enforcement === "block_above" || r.enforcement === "documents_above" || r.enforcement === "documents_always";

/** RULE_EVALUATED: deterministic outcome for each retrieved rule. */
export function evaluateRegulation(rules: CountryRule[], q: RegulatoryQuery, fx: FxService, now = new Date()): RegulatoryResult {
  const retrieved = retrieveRules(rules, q);
  const docsOnFile = q.documents_on_file ?? [];
  const missing = new Set<MissingField>();
  const hasAmount = q.amount != null && q.amount > 0 && !!q.currency;

  const findings: Finding[] = retrieved.map(({ rule, side, conditional }): Finding => {
    const jurisdiction = side === "receiving" ? rule.destination_country : rule.source_country;
    const docs = (names: string[]) => names.map((name) => ({ name, on_file: hasDocument(name, docsOnFile, q.purpose) }));
    const base = { rule, side, jurisdiction, documents: [] as Finding["documents"] };
    if (conditional.length) {
      conditional.forEach((m) => missing.add(m));
      return { ...base, outcome: "CONDITIONAL" as const, message: { code: "depends_on" as const, params: { fields: conditional.join(",") } } };
    }
    // Border-cash rules are guidance for travellers, never a check on a bank transfer.
    if (rule.channel === "cash") {
      const t = rule.limit_amount ?? rule.maximum_amount ?? rule.minimum_amount ?? 0;
      return { ...base, outcome: "INFO" as const, message: { code: "cash_guidance" as const, params: { limit: t, currency: rule.currency ?? "" } } };
    }
    if (rule.status === "needs_verification") {
      return { ...base, outcome: "UNVERIFIED" as const, message: { code: "unverified_rule" as const, params: {} as Record<string, string | number> } };
    }

    const threshold = rule.limit_amount ?? rule.maximum_amount ?? rule.minimum_amount ?? null;
    const amountDependent = rule.enforcement !== "info" && rule.enforcement !== "documents_always" && threshold != null && !!rule.currency;
    if (amountDependent && !hasAmount) missing.add("amount");
    const converted = hasAmount && rule.currency ? fx.convert(q.amount!, q.currency!, rule.currency) : null;
    const over = converted != null && threshold != null && converted > threshold;
    const p = { limit: threshold ?? 0, currency: rule.currency ?? "", amount: converted != null ? Math.round(converted * 100) / 100 : 0 };

    switch (rule.enforcement) {
      case "block_above":
        if (converted == null) return { ...base, outcome: "INFO" as const, message: { code: "disclosure" as const, params: p } };
        return over
          ? { ...base, outcome: "BLOCK" as const, message: { code: "over_limit" as const, params: p } }
          : { ...base, outcome: "PASS" as const, message: { code: "within_limit" as const, params: p } };
      case "documents_above": {
        if (converted != null && !over) return { ...base, outcome: "PASS" as const, message: { code: "below_threshold" as const, params: p } };
        const d = docs(rule.documentation_required);
        const needed = d.some((x) => !x.on_file);
        return { ...base, documents: d, outcome: needed ? ("DOCUMENTS" as const) : ("PASS" as const), message: { code: needed ? ("documents_needed" as const) : ("documents_ready" as const), params: p } };
      }
      case "documents_always": {
        const d = docs(rule.documentation_required);
        const needed = d.some((x) => !x.on_file);
        return { ...base, documents: d, outcome: needed ? ("DOCUMENTS" as const) : ("PASS" as const), message: { code: needed ? ("documents_needed" as const) : ("documents_ready" as const), params: p } };
      }
      case "report_above":
        if (converted == null) return { ...base, outcome: "INFO" as const, message: { code: "disclosure" as const, params: p } };
        return over
          ? { ...base, outcome: "REPORT" as const, message: { code: "report_over_threshold" as const, params: p } }
          : { ...base, outcome: "PASS" as const, message: { code: "report_below_threshold" as const, params: p } };
      default:
        return { ...base, outcome: "INFO" as const, message: { code: "disclosure" as const, params: p } };
    }
  });

  // Coverage per country side. A side with no verified rule can't be cleared.
  const coverage = (["sending", "receiving"] as const).map((side) => {
    const country = side === "sending" ? q.source_country : q.destination_country;
    const mine = findings.filter((f) => (f.side === side || f.side === "both") && f.rule.channel !== "cash");
    return { country, side, verified_rules: mine.filter((f) => f.rule.status === "verified").length, unverified_rules: mine.filter((f) => f.rule.status !== "verified").length };
  });

  const uncovered = [...new Set(coverage.filter((c) => c.verified_rules === 0).map((c) => c.country))];
  const verifiedFindings = findings.filter((f) => f.rule.status === "verified" && f.outcome !== "CONDITIONAL" && f.rule.channel !== "cash");
  let status: RegulatoryStatus;
  if (!verifiedFindings.length) status = "NEEDS_VERIFICATION";
  else if (verifiedFindings.some((f) => f.outcome === "BLOCK")) status = "BLOCKED";
  // An unverified rule only matters if it could gate the payment; unverified guidance is just shown.
  else if (missing.size || coverage.some((c) => c.verified_rules === 0) || findings.some((f) => f.outcome === "UNVERIFIED" && gates(f.rule))) status = "NEEDS_VERIFICATION";
  else if (verifiedFindings.some((f) => f.outcome === "DOCUMENTS")) status = "ACTION_REQUIRED";
  else status = "COMPLIANT";

  const docMap = new Map<string, boolean>();
  for (const f of findings) for (const d of f.documents) docMap.set(d.name, d.on_file);
  // Documents from conditional rules are listed too, so the student can prepare.
  for (const f of findings) if (f.outcome === "CONDITIONAL") for (const n of f.rule.documentation_required) if (!docMap.has(n)) docMap.set(n, hasDocument(n, docsOnFile, q.purpose));

  const limits = findings
    .filter((f) => (f.rule.limit_amount ?? f.rule.maximum_amount) != null && f.rule.currency)
    .map((f) => ({ rule_id: f.rule.id, text: f.rule.rule_name }));
  const considerations = findings
    .flatMap((f) => [f.rule.restrictions, f.rule.exceptions].filter(Boolean).map((text) => ({ rule_id: f.rule.id, text: text! })));

  const sourceMap = new Map<string, RegulatoryResult["sources"][number]>();
  for (const f of findings) {
    const key = f.rule.official_source_url;
    const s = sourceMap.get(key) ?? { regulator: f.rule.regulator ?? f.rule.official_source, url: key, last_verified: f.rule.last_verified, rule_ids: [], status: f.rule.status };
    s.rule_ids.push(f.rule.id);
    if (f.rule.last_verified < s.last_verified) s.last_verified = f.rule.last_verified;
    sourceMap.set(key, s);
  }

  return {
    status,
    query: q,
    coverage,
    findings,
    documents: [...docMap].map(([name, on_file]) => ({ name, on_file })),
    limits,
    considerations,
    sources: [...sourceMap.values()],
    missing_info: [...missing],
    // The exact sentence whenever part of the answer couldn't be verified: nothing verified at all,
    // or a side of the transfer with no verified rule on record (named in unverified_countries).
    unverified_message: status === "NEEDS_VERIFICATION" && (!verifiedFindings.length || uncovered.length) ? UNVERIFIED_MESSAGE : null,
    unverified_countries: status === "NEEDS_VERIFICATION" ? (verifiedFindings.length ? uncovered : [...new Set([q.source_country, q.destination_country])]) : [],
    checked_at: now.toISOString(),
  };
}

/**
 * Some rules name a generic document ("proof of payment purpose") that a specific document
 * satisfies for a given purpose. Only these explicit equivalences are applied.
 */
const DOC_EQUIVALENTS: Record<string, { purpose: RegulatoryQuery["purpose"] | "any"; satisfiedBy: string[] }> = {
  "Proof of payment purpose": { purpose: "education", satisfiedBy: ["University invoice", "Admission letter"] },
};

export function hasDocument(name: string, onFile: string[], purpose: RegulatoryQuery["purpose"]): boolean {
  if (onFile.includes(name)) return true;
  const eq = DOC_EQUIVALENTS[name];
  return !!eq && (eq.purpose === "any" || eq.purpose === purpose) && eq.satisfiedBy.some((d) => onFile.includes(d));
}

/** Builds a query from the user's profile, letting explicit values override it. */
export function queryFromProfile(profile: Profile, overrides: Partial<RegulatoryQuery> & Pick<RegulatoryQuery, "source_country" | "destination_country" | "purpose">): RegulatoryQuery {
  return {
    nationality: profile.nationality,
    residency_status: profile.residency_status,
    visa_type: profile.visa_type,
    student_status: profile.student_status,
    documents_on_file: profile.documents_on_file,
    ...overrides,
  };
}
