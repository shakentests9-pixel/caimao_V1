// Wire protocol between the agent route (/api/agent) and the Copilot UI.
// Newline-delimited JSON; one AgentEvent per line. Shared by server and client.
import type {
  Account,
  ComplianceResult,
  CountryRule,
  Currency,
  Obligation,
  PermissionLevel,
  RemittanceQuote,
  TransferRequest,
  ChecklistItem,
  CreditCard,
} from "../types";
import type { BudgetSummary } from "../budget/insights";
import type { ExplanationPart } from "../remittance/engine";
import type { RegulatoryResult } from "../regulatory/engine";
import type { EligibilityResult } from "../banking/eligibility";
import type { StatementAnalysis } from "../statements/analyse";
import type { AccountRequirements, CountryCode, CreditSystemInfo, Locale, SupportedCountry } from "../types";

export const PHASES = [
  "Understand",
  "Analyse",
  "Check compliance",
  "Compare",
  "Recommend",
  "Obtain approval",
  "Execute",
  "Verify",
] as const;
export type Phase = (typeof PHASES)[number];

export type AgentCard =
  | { kind: "obligations"; obligations: (Obligation & { days_until: number })[]; focus_id: string | null }
  | { kind: "accounts"; accounts: Account[]; total: number; base_currency: Currency }
  | { kind: "funds"; sufficient: boolean; account: string; available: number; required_estimate: number; currency: Currency; note: string }
  | { kind: "compliance"; result: ComplianceResult }
  | { kind: "rules"; rules: CountryRule[]; corridor: string }
  | {
      kind: "quotes";
      quotes: RemittanceQuote[];
      delivery_quotes: RemittanceQuote[];
      best_provider_id: string | null;
      lowest_fee_provider_id: string | null;
      compare_amount: number;
      destination_amount: number | null;
      explanation: string;
      explanation_parts?: ExplanationPart[];
      advantage_vs: { provider_name: string; extra_recipient_amount: number; lower_total_cost: number }[];
      fx_as_of: string;
      fx_source: string;
    }
  | { kind: "instruction"; request: TransferRequest; provider_name: string; account_label: string; obligation_title: string | null }
  | { kind: "blocked"; title: string; reason: string; items: string[] }
  | { kind: "spending"; summary: BudgetSummary }
  | { kind: "credit"; card: CreditCard; utilisation: number; days_until_due: number }
  | { kind: "checklist"; country: string; items: ChecklistItem[] }
  | { kind: "regulatory"; result: RegulatoryResult }
  | { kind: "banks"; country: SupportedCountry; eligibility: EligibilityResult; requirements: AccountRequirements | null }
  | { kind: "credit_info"; info: CreditSystemInfo }
  | { kind: "setup_plan"; country: SupportedCountry; home: CountryCode; completed: number; steps: { key: string; done: boolean }[] }
  | { kind: "statement"; analysis: StatementAnalysis }
  | { kind: "language"; language: Locale };

export type AgentEvent =
  | { type: "meta"; mode: "llm" | "scripted"; model: string | null; permission_level: PermissionLevel; correlation_id: string }
  | { type: "tool_start"; id: string; tool: string; label: string; level: PermissionLevel; phase: Phase; input: unknown }
  | { type: "tool_end"; id: string; tool: string; ok: boolean; summary: string; level: PermissionLevel; phase: Phase }
  | { type: "phase"; phase: Phase }
  | { type: "card"; card: AgentCard }
  | { type: "text"; text: string }
  | { type: "suggestions"; items: string[]; /** The item that prepares a payment, shown as the primary button. */ prepare?: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
