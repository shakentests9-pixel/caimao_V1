// Domain types shared by the server, the agent and the UI.
// They mirror the PostgreSQL schema in supabase/migrations/0001_schema.sql.

export const CURRENCIES = ["USD", "GBP", "SGD", "CNY", "HKD", "VND"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type CountryCode = "SG" | "GB" | "CN" | "VN" | "HK" | "US";

export const COUNTRY_NAMES: Record<CountryCode, string> = {
  SG: "Singapore",
  GB: "United Kingdom",
  CN: "China",
  VN: "Vietnam",
  HK: "Hong Kong",
  US: "United States",
};

/** AI permission levels. Level 3 always needs a fresh, explicit approval per transaction. */
export enum PermissionLevel {
  Information = 0,
  Read = 1,
  Prepare = 2,
  Execute = 3,
}

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  [PermissionLevel.Information]: "Level 0 · Information",
  [PermissionLevel.Read]: "Level 1 · Read",
  [PermissionLevel.Prepare]: "Level 2 · Prepare",
  [PermissionLevel.Execute]: "Level 3 · Execute",
};

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  home_country: CountryCode;
  study_country: CountryCode;
  home_currency: Currency;
  study_currency: Currency;
  base_currency: Currency;
  university: string;
  /** Highest level the AI may act at without asking. Level 3 is never granted standing. */
  ai_permission_level: PermissionLevel;
  /** Supporting documents the user has on file, matched against rule requirements. */
  documents_on_file: string[];
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  institution: string;
  country: CountryCode;
  currency: Currency;
  balance: number;
  /** Only the last four digits are ever stored or shown. */
  account_last4: string;
  kind: "bank" | "wallet";
}

export type TransactionCategory =
  | "Income"
  | "Accommodation"
  | "Food"
  | "Transportation"
  | "Education"
  | "Entertainment"
  | "Travel"
  | "Subscriptions"
  | "Transfers";

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  date: string; // ISO date
  description: string;
  merchant: string;
  amount: number; // negative = outflow
  currency: Currency;
  category: TransactionCategory;
  /** How the category was set: by the rule-based classifier or by a sandbox execution. */
  category_source: "classifier" | "system";
}

export type ObligationStatus = "UPCOMING" | "PAYMENT_DUE" | "PROCESSING" | "PAID";

export interface Obligation {
  id: string;
  user_id: string;
  title: string;
  kind: "tuition" | "rent" | "card" | "other";
  payee: string;
  invoice_ref: string;
  amount: number;
  currency: Currency;
  due_date: string; // ISO date
  status: ObligationStatus;
  purpose: string;
  destination_country: CountryCode;
  paid_at?: string | null;
  payment_execution_id?: string | null;
}

export interface Budget {
  id: string;
  user_id: string;
  category: TransactionCategory;
  monthly_limit: number;
  currency: Currency;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface CountryRule {
  id: string;
  source_country: CountryCode | "*";
  destination_country: CountryCode | "*";
  transaction_type: "education" | "personal" | "any";
  rule_name: string;
  rule_description: string;
  currency: Currency | null;
  /** Amount at which the rule triggers. Interpretation depends on enforcement. */
  limit_amount: number | null;
  /** block_above: amounts over the limit are rejected. documents_above: documents needed over the limit. documents_always: always needs documents. info: disclosure only. */
  enforcement: "block_above" | "documents_above" | "documents_always" | "info";
  documentation_required: string[];
  official_source: string;
  official_source_url: string;
  effective_date: string;
  last_verified: string;
  risk_level: RiskLevel;
  is_demo: boolean;
}

export interface FxRate {
  base: "USD";
  quote: Currency;
  /** Units of `quote` per 1 USD (mid-market). */
  rate: number;
  as_of: string;
  source: string;
}

export interface RemittanceProvider {
  id: string;
  name: string;
  kind: "bank" | "remittance" | "wallet";
  /** Provider margin applied to the mid-market rate, e.g. 0.025 = 2.5%. */
  fx_margin: number;
  fixed_fee: number;
  fee_currency: Currency;
  /** Percentage fee on the send amount, e.g. 0.002 = 0.2%. */
  pct_fee: number;
  other_charges: number;
  /** Advertised as fee-free in marketing. Never used for ranking. */
  advertises_zero_fee: boolean;
  settlement_business_days: number;
  settlement_label: string;
  max_single_transfer: number;
  max_currency: Currency;
  is_demo: boolean;
}

export interface RemittanceQuote {
  id: string;
  provider_id: string;
  provider_name: string;
  source_currency: Currency;
  destination_currency: Currency;
  source_amount: number;
  market_fx_rate: number;
  provider_fx_rate: number;
  /** (market - provider) / market */
  fx_spread_pct: number;
  transfer_fee: number;
  other_charges: number;
  /** Spread cost expressed in the source currency. */
  fx_spread_cost: number;
  /** fee + spread cost + other charges, in the source currency. */
  total_cost: number;
  /** Same total cost expressed in the destination currency at mid-market. */
  total_cost_destination: number;
  estimated_recipient_amount: number;
  settlement_time: string;
  settlement_business_days: number;
  is_estimate: true;
  /** False when the amount exceeds the provider's single-transfer limit. */
  available: boolean;
  unavailable_reason: string | null;
  created_at: string;
}

export type ComplianceStatus = "COMPLIANT" | "ACTION_REQUIRED" | "BLOCKED";

export interface RuleEvaluation {
  rule: CountryRule;
  outcome: "PASS" | "DOCUMENTS" | "BLOCK" | "INFO";
  message: string;
  documents: { name: string; on_file: boolean }[];
}

export interface ComplianceResult {
  status: ComplianceStatus;
  source_country: CountryCode;
  destination_country: CountryCode;
  transaction_type: CountryRule["transaction_type"];
  evaluations: RuleEvaluation[];
  required_documents: { name: string; on_file: boolean }[];
  /** "no_rules" means the database holds no rules for this corridor, so it cannot be cleared. */
  coverage: "rules_found" | "no_rules";
  checked_at: string;
}

export type TransferStatus = "PENDING_APPROVAL" | "APPROVED" | "EXECUTING" | "COMPLETED" | "FAILED" | "CANCELLED" | "REJECTED";

export interface TransferRequest {
  id: string;
  user_id: string;
  obligation_id: string | null;
  source_account_id: string;
  provider_id: string;
  quote_id: string;
  recipient: string;
  recipient_country: CountryCode;
  purpose: string;
  invoice_ref: string | null;
  source_amount: number;
  source_currency: Currency;
  destination_amount: number;
  destination_currency: Currency;
  provider_fx_rate: number;
  market_fx_rate: number;
  transfer_fee: number;
  total_cost: number;
  estimated_settlement_date: string;
  compliance_status: ComplianceStatus;
  compliance_snapshot: ComplianceResult;
  required_documents: { name: string; on_file: boolean }[];
  status: TransferStatus;
  prepared_by: "ai_agent" | "user";
  approved_at: string | null;
  approval_ack: boolean;
  created_at: string;
  expires_at: string;
}

export interface PaymentExecution {
  id: string;
  transaction_id: string; // e.g. UF-2026-000184
  user_id: string;
  transfer_request_id: string;
  status: "COMPLETED" | "FAILED";
  timestamp: string;
  provider: string;
  source_amount: number;
  source_currency: Currency;
  destination_amount: number;
  destination_currency: Currency;
  fee: number;
  recipient: string;
  failure_reason?: string | null;
}

export type AuditAction =
  | "PROFILE_READ"
  | "ACCOUNTS_READ"
  | "TRANSACTIONS_READ"
  | "OBLIGATIONS_READ"
  | "FX_RATE_READ"
  | "TRANSFER_RULE_CHECK"
  | "QUOTE_RETRIEVAL"
  | "COST_CALCULATION"
  | "TRANSFER_PREPARED"
  | "TRANSFER_REJECTED"
  | "USER_APPROVAL"
  | "USER_DECLINED"
  | "TRANSFER_EXECUTED"
  | "TRANSFER_FAILED"
  | "BALANCE_UPDATED"
  | "OBLIGATION_PAID"
  | "PERMISSION_DENIED"
  | "SETTINGS_CHANGED"
  | "DEMO_RESET";

export interface AuditLog {
  id: string;
  timestamp: string;
  user_id: string;
  actor: "ai_agent" | "user" | "system";
  action: AuditAction;
  tool: string | null;
  permission_level: PermissionLevel;
  details: Record<string, unknown>;
  approval_status: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "DECLINED";
  result: "SUCCESS" | "FAILURE" | "BLOCKED";
  correlation_id: string | null;
}

export interface AiConversationMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  user_id: string;
  country: CountryCode;
  label: string;
  detail: string;
  completed: boolean;
}

export interface CreditCard {
  id: string;
  user_id: string;
  issuer: string;
  last4: string;
  currency: Currency;
  credit_limit: number;
  current_balance: number;
  payment_due_date: string;
  minimum_payment: number;
  /** Last 6 statement outcomes, oldest first. */
  payment_history: { month: string; status: "ON_TIME" | "LATE" | "NO_STATEMENT" }[];
}
