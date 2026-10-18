import type {
  ComplianceResult,
  ComplianceStatus,
  CountryCode,
  CountryRule,
  Currency,
  ResidencyStatus,
  RuleEvaluation,
  VisaType,
} from "../types";
import { formatMoney, type FxService } from "../fx/service";

/**
 * Evaluates a proposed transfer against rules retrieved from country_rules.
 * The engine never creates rules: if the database has none for a corridor, it
 * says so instead of guessing.
 */
export interface ComplianceInput {
  source_country: CountryCode;
  destination_country: CountryCode;
  transaction_type: "education" | "personal";
  source_amount: number;
  source_currency: Currency;
  documents_on_file: string[];
  /** The payer's details, used to match researched rules that only apply to some people. */
  payer?: { nationality: CountryCode | null; residency_status: ResidencyStatus | null; visa_type: VisaType | null };
}

type PayerConditions = ComplianceInput["payer"];

/**
 * Rules that gate a bank transfer: simulated demo rules and verified researched rules.
 * Border-cash rules and unverified rules are guidance only and never gate a payment.
 * A rule limited to certain people applies only when the payer is known to match.
 */
export function matchRules(
  rules: CountryRule[],
  q: { source_country: CountryCode; destination_country: CountryCode; transaction_type?: string; payer?: PayerConditions },
): CountryRule[] {
  return rules.filter((r) => {
    const corridor =
      (r.source_country === q.source_country || r.source_country === "*") &&
      (r.destination_country === q.destination_country || r.destination_country === "*") &&
      (!q.transaction_type || r.transaction_type === "any" || r.transaction_type === q.transaction_type);
    if (!corridor) return false;
    if (r.status === "needs_verification" || r.channel === "cash") return false;
    if (r.direction === "outbound" && r.source_country === "*") return false;
    if (r.direction === "inbound" && r.destination_country === "*") return false;
    const p = q.payer;
    if (r.nationality_condition?.length && !(p?.nationality && r.nationality_condition.includes(p.nationality))) return false;
    if (r.residency_condition && p?.residency_status !== r.residency_condition) return false;
    if (r.visa_condition?.length && !(p?.visa_type && r.visa_condition.includes(p.visa_type))) return false;
    return true;
  });
}

export function evaluateCompliance(rules: CountryRule[], input: ComplianceInput, fx: FxService, now = new Date()): ComplianceResult {
  const matched = matchRules(rules, input);
  const docs = (names: string[]) => names.map((name) => ({ name, on_file: input.documents_on_file.includes(name) }));

  const evaluations: RuleEvaluation[] = matched.map((rule) => {
    const amountInRuleCcy = rule.currency ? fx.convert(input.source_amount, input.source_currency, rule.currency) : null;
    const over = rule.limit_amount != null && amountInRuleCcy != null && amountInRuleCcy > rule.limit_amount;
    const limitText = rule.limit_amount != null && rule.currency ? formatMoney(rule.limit_amount, rule.currency) : "";
    const amountText = amountInRuleCcy != null && rule.currency ? `≈ ${formatMoney(amountInRuleCcy, rule.currency)}` : "";

    switch (rule.enforcement) {
      case "report_above":
        return { rule, outcome: "INFO", message: over ? `Above ${limitText} (${amountText}): the bank files a report. Nothing extra is needed from you.` : rule.rule_name, documents: [] };
      case "block_above":
        return over
          ? { rule, outcome: "BLOCK", message: `Transfer ${amountText} exceeds the limit of ${limitText}.`, documents: [] }
          : { rule, outcome: "PASS", message: `Within the limit of ${limitText} (${amountText}).`, documents: [] };
      case "documents_above": {
        if (!over) return { rule, outcome: "PASS", message: `Below the ${limitText} threshold (${amountText}); no documents needed.`, documents: [] };
        const d = docs(rule.documentation_required);
        const missing = d.filter((x) => !x.on_file);
        return {
          rule,
          outcome: missing.length ? "DOCUMENTS" : "PASS",
          message: missing.length
            ? `Above ${limitText} (${amountText}). Missing: ${missing.map((m) => m.name).join(", ")}.`
            : `Above ${limitText} (${amountText}). Required documents are on file.`,
          documents: d,
        };
      }
      case "documents_always": {
        const d = docs(rule.documentation_required);
        const missing = d.filter((x) => !x.on_file);
        return {
          rule,
          outcome: missing.length ? "DOCUMENTS" : "PASS",
          message: missing.length ? `Missing: ${missing.map((m) => m.name).join(", ")}.` : "Required documents are on file.",
          documents: d,
        };
      }
      default:
        return { rule, outcome: "INFO", message: rule.rule_name, documents: [] };
    }
  });

  // No rules on record means the corridor cannot be verified, which is not the same as compliant.
  const status: ComplianceStatus = matched.length === 0
    ? "ACTION_REQUIRED"
    : evaluations.some((e) => e.outcome === "BLOCK")
    ? "BLOCKED"
    : evaluations.some((e) => e.outcome === "DOCUMENTS")
      ? "ACTION_REQUIRED"
      : "COMPLIANT";

  const required = new Map<string, boolean>();
  for (const e of evaluations) for (const d of e.documents) required.set(d.name, d.on_file);

  return {
    status,
    source_country: input.source_country,
    destination_country: input.destination_country,
    transaction_type: input.transaction_type,
    evaluations,
    required_documents: [...required].map(([name, on_file]) => ({ name, on_file })),
    coverage: matched.length ? "rules_found" : "no_rules",
    checked_at: now.toISOString(),
  };
}
