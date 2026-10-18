import { REFERENCE } from "./reference";
import type {
  Account,
  Budget,
  ChecklistItem,
  CountryRule,
  CreditCard,
  FxRate,
  Obligation,
  Profile,
  RemittanceProvider,
  Transaction,
  TransactionCategory,
} from "./types";
import { PermissionLevel } from "./types";
import { classifyTransaction } from "./budget/classifier";

/**
 * One complete demonstration user (Alex Tan, Singapore → United Kingdom).
 * Every date is relative to `now`, so the tuition invoice is always due in 12 days
 * on the day the demo is reset. The same data is written to Supabase by scripts/seed-supabase.ts.
 */

export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000a1e5";
export const DEMO_EMAIL = "alex.tan@demo.caimao.app";

export const ACCOUNT_IDS = {
  sgBank: "acc-sg-bank",
  ukBank: "acc-uk-bank",
  wallet: "acc-mc-wallet",
} as const;

export const PROVIDER_IDS = {
  homeBank: "prov-home-bank",
  panda: "prov-panda-remit-demo",
  wallet: "prov-mc-wallet-demo",
} as const;

export const TUITION_OBLIGATION_ID = "obl-tuition-2026-001";

export interface SeedScenario {
  id: "standard" | "insufficient_funds" | "over_limit";
  label: string;
  description: string;
}

export const SCENARIOS: SeedScenario[] = [
  { id: "standard", label: "Standard demo", description: "SGD 32,000 available, GBP 15,000 tuition. Every check passes." },
  { id: "insufficient_funds", label: "Insufficient funds", description: "Singapore Bank holds SGD 8,000. The agent will not prepare a transfer." },
  { id: "over_limit", label: "Over the transfer limit", description: "Tuition of GBP 120,000 exceeds the demo SGD 200,000 single-transfer rule. The transfer is blocked." },
];

export interface DemoState {
  profile: Profile;
  accounts: Account[];
  transactions: Transaction[];
  obligations: Obligation[];
  budgets: Budget[];
  country_rules: CountryRule[];
  fx_rates: FxRate[];
  remittance_providers: RemittanceProvider[];
  credit_cards: CreditCard[];
  checklist_items: ChecklistItem[];
  scenario: SeedScenario["id"];
  seeded_at: string;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (now: Date, days: number) => {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

export const SEED_FX_RATES: Omit<FxRate, "as_of">[] = [
  { base: "USD", quote: "USD", rate: 1, source: "CaiMao seeded demo rates" },
  { base: "USD", quote: "GBP", rate: 0.745, source: "CaiMao seeded demo rates" },
  { base: "USD", quote: "SGD", rate: 1.29, source: "CaiMao seeded demo rates" },
  { base: "USD", quote: "CNY", rate: 7.12, source: "CaiMao seeded demo rates" },
  { base: "USD", quote: "HKD", rate: 7.79, source: "CaiMao seeded demo rates" },
  { base: "USD", quote: "VND", rate: 26200, source: "CaiMao seeded demo rates" },
  { base: "USD", quote: "JPY", rate: 151.4, source: "CaiMao seeded demo rates" },
];

export function buildProviders(): RemittanceProvider[] {
  return [
    {
      id: PROVIDER_IDS.homeBank,
      name: "Home Bank",
      kind: "bank",
      fx_margin: 0.022,
      fixed_fee: 0,
      fee_currency: "SGD",
      pct_fee: 0,
      other_charges: 0,
      advertises_zero_fee: true,
      settlement_business_days: 2,
      settlement_label: "1–2 business days",
      max_single_transfer: 200000,
      max_currency: "SGD",
      is_demo: true,
    },
    {
      id: PROVIDER_IDS.panda,
      name: "Panda Remit Demo",
      kind: "remittance",
      fx_margin: 0.0045,
      fixed_fee: 15,
      fee_currency: "SGD",
      pct_fee: 0,
      other_charges: 0,
      advertises_zero_fee: false,
      settlement_business_days: 1,
      settlement_label: "Within 1 business day",
      max_single_transfer: 200000,
      max_currency: "SGD",
      is_demo: true,
    },
    {
      id: PROVIDER_IDS.wallet,
      name: "Multi-Currency Wallet Demo",
      kind: "wallet",
      fx_margin: 0.004,
      fixed_fee: 0,
      fee_currency: "SGD",
      pct_fee: 0.0035,
      other_charges: 4,
      advertises_zero_fee: false,
      settlement_business_days: 0,
      settlement_label: "Same day",
      max_single_transfer: 200000,
      max_currency: "SGD",
      is_demo: true,
    },
  ];
}

const DEMO_NOTE = "Simulated rule for demonstration only. Not legal or regulatory advice; verify with the official source.";

export function buildCountryRules(): CountryRule[] {
  const verified = "2026-09-15";
  const r = (rule: Omit<CountryRule, "is_demo" | "last_verified" | "rule_description"> & { rule_description: string }): CountryRule => ({
    ...rule,
    rule_description: `${rule.rule_description} ${DEMO_NOTE}`,
    last_verified: verified,
    is_demo: true,
    status: "simulated",
    channel: "bank_transfer",
    regulator: rule.official_source,
  });
  return [
    // Singapore outbound
    r({ id: "rule-sg-id", source_country: "SG", destination_country: "*", transaction_type: "any", rule_name: "Sender identification for outward remittances", rule_description: "The sender must be identified with a valid government-issued photo ID before an outward remittance is sent.", currency: null, limit_amount: null, enforcement: "documents_always", documentation_required: ["Passport or national ID"], official_source: "Monetary Authority of Singapore (MAS)", official_source_url: "https://www.mas.gov.sg", effective_date: "2024-01-01", risk_level: "LOW" }),
    r({ id: "rule-sg-limit", source_country: "SG", destination_country: "*", transaction_type: "any", rule_name: "Single outward transfer limit (demo corridor)", rule_description: "A single outward transfer may not exceed SGD 200,000 in this demo corridor.", currency: "SGD", limit_amount: 200000, enforcement: "block_above", documentation_required: [], official_source: "Monetary Authority of Singapore (MAS)", official_source_url: "https://www.mas.gov.sg", effective_date: "2024-01-01", risk_level: "MEDIUM" }),
    r({ id: "rule-sg-edu", source_country: "SG", destination_country: "*", transaction_type: "education", rule_name: "Education payments need a supporting invoice", rule_description: "Transfers made for tuition must reference an invoice issued by the institution.", currency: null, limit_amount: null, enforcement: "documents_always", documentation_required: ["University invoice"], official_source: "Monetary Authority of Singapore (MAS)", official_source_url: "https://www.mas.gov.sg", effective_date: "2024-01-01", risk_level: "LOW" }),
    // United Kingdom inbound / outbound
    r({ id: "rule-gb-sof", source_country: "*", destination_country: "GB", transaction_type: "any", rule_name: "Source-of-funds declaration above GBP 10,000", rule_description: "Inbound payments above GBP 10,000 need a source-of-funds declaration from the payer.", currency: "GBP", limit_amount: 10000, enforcement: "documents_above", documentation_required: ["Source-of-funds declaration"], official_source: "Financial Conduct Authority (FCA)", official_source_url: "https://www.fca.org.uk", effective_date: "2025-04-01", risk_level: "MEDIUM" }),
    r({ id: "rule-gb-edu", source_country: "*", destination_country: "GB", transaction_type: "education", rule_name: "University fee payments quote the student reference", rule_description: "Payments to UK universities must quote the student's enrolment reference so the institution can match the funds.", currency: null, limit_amount: null, enforcement: "documents_always", documentation_required: ["Confirmation of enrolment (CAS)"], official_source: "UK Council for International Student Affairs (UKCISA)", official_source_url: "https://www.ukcisa.org.uk", effective_date: "2025-01-01", risk_level: "LOW" }),
    r({ id: "rule-gb-cop", source_country: "GB", destination_country: "*", transaction_type: "any", rule_name: "Payee name check before sending", rule_description: "Outbound payments from UK accounts show a payee name check before they are released.", currency: null, limit_amount: null, enforcement: "info", documentation_required: [], official_source: "Financial Conduct Authority (FCA)", official_source_url: "https://www.fca.org.uk", effective_date: "2024-10-01", risk_level: "LOW" }),
    // China outbound
    r({ id: "rule-cn-quota", source_country: "CN", destination_country: "*", transaction_type: "personal", rule_name: "Annual individual FX purchase quota", rule_description: "Individuals may purchase up to USD 50,000 equivalent of foreign currency per calendar year for personal use.", currency: "USD", limit_amount: 50000, enforcement: "block_above", documentation_required: [], official_source: "State Administration of Foreign Exchange (SAFE)", official_source_url: "https://www.safe.gov.cn", effective_date: "2023-01-01", risk_level: "HIGH" }),
    r({ id: "rule-cn-edu", source_country: "CN", destination_country: "*", transaction_type: "education", rule_name: "Study-abroad tuition documentation", rule_description: "Tuition purchases of foreign currency require the admission letter, tuition invoice and passport.", currency: null, limit_amount: null, enforcement: "documents_always", documentation_required: ["Admission letter", "University invoice", "Passport or national ID"], official_source: "State Administration of Foreign Exchange (SAFE)", official_source_url: "https://www.safe.gov.cn", effective_date: "2023-01-01", risk_level: "MEDIUM" }),
    // Vietnam outbound
    r({ id: "rule-vn-edu", source_country: "VN", destination_country: "*", transaction_type: "education", rule_name: "Outward transfer for study abroad", rule_description: "Outward transfers for study abroad require the enrolment letter, tuition invoice and passport.", currency: null, limit_amount: null, enforcement: "documents_always", documentation_required: ["Admission letter", "University invoice", "Passport or national ID"], official_source: "State Bank of Vietnam (SBV)", official_source_url: "https://www.sbv.gov.vn", effective_date: "2023-07-01", risk_level: "MEDIUM" }),
    r({ id: "rule-vn-personal", source_country: "VN", destination_country: "*", transaction_type: "personal", rule_name: "Outward personal transfers need a documented purpose", rule_description: "Outward personal transfers without a documented eligible purpose are not permitted.", currency: "VND", limit_amount: 0, enforcement: "block_above", documentation_required: [], official_source: "State Bank of Vietnam (SBV)", official_source_url: "https://www.sbv.gov.vn", effective_date: "2023-07-01", risk_level: "HIGH" }),
    // Hong Kong outbound
    r({ id: "rule-hk-record", source_country: "HK", destination_country: "*", transaction_type: "any", rule_name: "Remittance identification above HKD 8,000", rule_description: "Remittances of HKD 8,000 or more require the sender's identification to be recorded.", currency: "HKD", limit_amount: 8000, enforcement: "documents_above", documentation_required: ["Passport or national ID"], official_source: "Hong Kong Monetary Authority (HKMA)", official_source_url: "https://www.hkma.gov.hk", effective_date: "2023-01-01", risk_level: "LOW" }),
    // United States
    r({ id: "rule-us-report", source_country: "US", destination_country: "*", transaction_type: "any", rule_name: "Additional reporting above USD 10,000", rule_description: "Transfers above USD 10,000 may be subject to additional reporting by the sending institution.", currency: "USD", limit_amount: 10000, enforcement: "info", documentation_required: [], official_source: "Financial Crimes Enforcement Network (FinCEN)", official_source_url: "https://www.fincen.gov", effective_date: "2023-01-01", risk_level: "LOW" }),
    r({ id: "rule-us-edu", source_country: "*", destination_country: "US", transaction_type: "education", rule_name: "US institution payment reference", rule_description: "Payments to US institutions must quote the student ID shown on the institution's billing statement.", currency: null, limit_amount: null, enforcement: "documents_always", documentation_required: ["University invoice"], official_source: "Financial Crimes Enforcement Network (FinCEN)", official_source_url: "https://www.fincen.gov", effective_date: "2023-01-01", risk_level: "LOW" }),
    // Singapore inbound
    r({ id: "rule-sg-inbound", source_country: "*", destination_country: "SG", transaction_type: "any", rule_name: "Inbound remittance disclosure", rule_description: "Inbound remittances may be held for review when the purpose of payment is missing.", currency: null, limit_amount: null, enforcement: "info", documentation_required: [], official_source: "Monetary Authority of Singapore (MAS)", official_source_url: "https://www.mas.gov.sg", effective_date: "2024-01-01", risk_level: "LOW" }),
  ];
}

interface RawTxn {
  daysAgo: number;
  account: keyof typeof ACCOUNT_IDS;
  description: string;
  merchant: string;
  amount: number;
}

// About 35 transactions over the last ~120 days. Categories are assigned by the classifier.
const RAW_TRANSACTIONS: RawTxn[] = [
  // Income
  { daysAgo: 2, account: "sgBank", description: "Family support — monthly allowance", merchant: "Tan Family FAST transfer", amount: 3000 },
  { daysAgo: 33, account: "sgBank", description: "Family support — monthly allowance", merchant: "Tan Family FAST transfer", amount: 3000 },
  { daysAgo: 64, account: "sgBank", description: "Family support — monthly allowance", merchant: "Tan Family FAST transfer", amount: 3000 },
  { daysAgo: 6, account: "ukBank", description: "Library assistant — salary", merchant: "Example University Payroll", amount: 640 },
  { daysAgo: 37, account: "ukBank", description: "Library assistant — salary", merchant: "Example University Payroll", amount: 610 },
  { daysAgo: 68, account: "ukBank", description: "Library assistant — salary", merchant: "Example University Payroll", amount: 590 },
  // Accommodation
  { daysAgo: 12, account: "ukBank", description: "Monthly rent — September", merchant: "Northgate Student Living", amount: -850 },
  { daysAgo: 42, account: "ukBank", description: "Monthly rent — August", merchant: "Northgate Student Living", amount: -850 },
  { daysAgo: 73, account: "ukBank", description: "Monthly rent — July", merchant: "Northgate Student Living", amount: -850 },
  { daysAgo: 104, account: "ukBank", description: "Monthly rent — June", merchant: "Northgate Student Living", amount: -850 },
  // Food (trailing 30 days runs higher than the prior 3-window average)
  { daysAgo: 3, account: "ukBank", description: "Groceries", merchant: "Tesco Express", amount: -64.2 },
  { daysAgo: 9, account: "ukBank", description: "Lunch", merchant: "Pret A Manger", amount: -11.4 },
  { daysAgo: 15, account: "ukBank", description: "Groceries", merchant: "Sainsbury's", amount: -78.55 },
  { daysAgo: 21, account: "ukBank", description: "Dinner delivery", merchant: "Deliveroo", amount: -26.9 },
  { daysAgo: 26, account: "ukBank", description: "Groceries", merchant: "Tesco Express", amount: -71.3 },
  { daysAgo: 40, account: "ukBank", description: "Groceries", merchant: "Sainsbury's", amount: -88.1 },
  { daysAgo: 52, account: "ukBank", description: "Groceries", merchant: "Tesco Express", amount: -59.75 },
  { daysAgo: 77, account: "ukBank", description: "Groceries", merchant: "Sainsbury's", amount: -92.4 },
  { daysAgo: 47, account: "ukBank", description: "Dinner delivery", merchant: "Deliveroo", amount: -60.5 },
  { daysAgo: 66, account: "ukBank", description: "Groceries", merchant: "Sainsbury's", amount: -63.2 },
  { daysAgo: 84, account: "ukBank", description: "Groceries", merchant: "Tesco Express", amount: -52.1 },
  { daysAgo: 96, account: "ukBank", description: "Groceries", merchant: "Tesco Express", amount: -101.6 },
  { daysAgo: 103, account: "ukBank", description: "Groceries", merchant: "Sainsbury's", amount: -71.05 },
  { daysAgo: 112, account: "ukBank", description: "Dinner delivery", merchant: "Deliveroo", amount: -34.6 },
  // Transportation
  { daysAgo: 8, account: "ukBank", description: "Student bus pass", merchant: "Stagecoach", amount: -42 },
  { daysAgo: 38, account: "ukBank", description: "Student bus pass", merchant: "Stagecoach", amount: -42 },
  { daysAgo: 18, account: "ukBank", description: "Train to London", merchant: "Trainline", amount: -36.8 },
  // Education
  { daysAgo: 14, account: "ukBank", description: "Course textbooks", merchant: "Blackwell's Bookshop", amount: -87.5 },
  // Entertainment
  { daysAgo: 11, account: "ukBank", description: "Cinema", merchant: "Odeon Cinemas", amount: -14.5 },
  { daysAgo: 46, account: "ukBank", description: "Concert ticket", merchant: "Ticketmaster UK", amount: -48 },
  // Travel
  { daysAgo: 58, account: "wallet", description: "Flight to Edinburgh", merchant: "easyJet", amount: -112 },
  // Subscriptions
  { daysAgo: 5, account: "ukBank", description: "Music subscription", merchant: "Spotify", amount: -5.99 },
  { daysAgo: 35, account: "ukBank", description: "Music subscription", merchant: "Spotify", amount: -5.99 },
  { daysAgo: 7, account: "ukBank", description: "Mobile plan", merchant: "giffgaff", amount: -10 },
  // Transfers
  { daysAgo: 30, account: "sgBank", description: "Top-up to UK account", merchant: "Outward remittance SGD→GBP", amount: -1720 },
  { daysAgo: 30, account: "ukBank", description: "Top-up from Singapore", merchant: "Inward remittance SGD→GBP", amount: 990 },
];

export function buildSeed(now: Date = new Date(), scenario: SeedScenario["id"] = "standard"): DemoState {
  const seededAt = now.toISOString();

  const profile: Profile = {
    id: DEMO_USER_ID,
    full_name: "Alex Tan",
    email: DEMO_EMAIL,
    home_country: "SG",
    study_country: "GB",
    home_currency: "SGD",
    study_currency: "GBP",
    base_currency: "SGD",
    university: "Example University",
    ai_permission_level: PermissionLevel.Prepare,
    nationality: "SG",
    visa_type: "student",
    residency_status: "resident",
    student_status: "full_time",
    age: 21,
    tax_residency: null,
    language: "en",
    documents_on_file: [
      "Passport or national ID",
      "University invoice",
      "Confirmation of enrolment (CAS)",
      "Source-of-funds declaration",
    ],
  };

  const accounts: Account[] = [
    { id: ACCOUNT_IDS.sgBank, user_id: DEMO_USER_ID, name: "Singapore Bank", institution: "Home Bank", country: "SG", currency: "SGD", balance: scenario === "insufficient_funds" ? 8000 : scenario === "over_limit" ? 260000 : 32000, account_last4: "4821", kind: "bank" },
    { id: ACCOUNT_IDS.ukBank, user_id: DEMO_USER_ID, name: "UK Bank", institution: "UK Bank", country: "GB", currency: "GBP", balance: 3200, account_last4: "7730", kind: "bank" },
    { id: ACCOUNT_IDS.wallet, user_id: DEMO_USER_ID, name: "Multi-Currency Wallet", institution: "Multi-Currency Wallet Demo", country: "SG", currency: "USD", balance: 1000, account_last4: "3092", kind: "wallet" },
  ];

  const currencyOf = (a: keyof typeof ACCOUNT_IDS) => accounts.find((x) => x.id === ACCOUNT_IDS[a])!.currency;
  const transactions: Transaction[] = RAW_TRANSACTIONS.map((t, i) => {
    const category: TransactionCategory = classifyTransaction(t.merchant, t.description, t.amount);
    return {
      id: `txn-${String(i + 1).padStart(3, "0")}`,
      user_id: DEMO_USER_ID,
      account_id: ACCOUNT_IDS[t.account],
      date: isoDate(addDays(now, -t.daysAgo)),
      description: t.description,
      merchant: t.merchant,
      amount: t.amount,
      currency: currencyOf(t.account),
      category,
      category_source: "classifier",
    };
  });

  const obligations: Obligation[] = [
    { id: TUITION_OBLIGATION_ID, user_id: DEMO_USER_ID, title: "University Tuition", kind: "tuition", payee: "Example University Treasury", invoice_ref: "TUITION-2026-001", amount: scenario === "over_limit" ? 120000 : 15000, currency: "GBP", due_date: isoDate(addDays(now, 12)), status: "PAYMENT_DUE", purpose: "Education / Tuition", destination_country: "GB", paid_at: null, payment_execution_id: null },
    { id: "obl-rent-oct", user_id: DEMO_USER_ID, title: "Rent", kind: "rent", payee: "Northgate Student Living", invoice_ref: "NSL-RENT-OCT", amount: 850, currency: "GBP", due_date: isoDate(addDays(now, 18)), status: "UPCOMING", purpose: "Accommodation", destination_country: "GB", paid_at: null, payment_execution_id: null },
    { id: "obl-card", user_id: DEMO_USER_ID, title: "Student credit card", kind: "card", payee: "UK Bank Card Services", invoice_ref: "CARD-STMT-0926", amount: 320, currency: "GBP", due_date: isoDate(addDays(now, 5)), status: "PAYMENT_DUE", purpose: "Card repayment", destination_country: "GB", paid_at: null, payment_execution_id: null },
    { id: "obl-phone", user_id: DEMO_USER_ID, title: "Mobile plan", kind: "other", payee: "giffgaff", invoice_ref: "GG-1026", amount: 10, currency: "GBP", due_date: isoDate(addDays(now, 27)), status: "UPCOMING", purpose: "Subscriptions", destination_country: "GB", paid_at: null, payment_execution_id: null },
  ];

  const budgets: Budget[] = (
    [
      ["Accommodation", 850],
      ["Food", 220],
      ["Transportation", 90],
      ["Education", 100],
      ["Entertainment", 60],
      ["Travel", 120],
      ["Subscriptions", 20],
    ] as const
  ).map(([category, limit], i) => ({ id: `bud-${i + 1}`, user_id: DEMO_USER_ID, category, monthly_limit: limit, currency: "GBP" }));

  const credit_cards: CreditCard[] = [
    {
      id: "card-uk-student",
      user_id: DEMO_USER_ID,
      issuer: "UK Bank Student Credit Card",
      last4: "5519",
      currency: "GBP",
      credit_limit: 1500,
      current_balance: 320,
      payment_due_date: isoDate(addDays(now, 5)),
      minimum_payment: 25,
      payment_history: monthsBack(now, 6).map((month, i) => ({ month, status: i < 2 ? "NO_STATEMENT" : "ON_TIME" })),
    },
  ];

  const checklist_items: ChecklistItem[] = CHECKLISTS.flatMap(([country, items]) =>
    items.map(([label, detail], i) => ({
      id: `chk-${country.toLowerCase()}-${i + 1}`,
      user_id: DEMO_USER_ID,
      country,
      label,
      detail,
      completed: country === "GB" && i === 0,
    })),
  );

  return {
    profile,
    accounts,
    transactions,
    obligations,
    budgets,
    // Simulated demo rules drive the sandbox tuition demo; researched rules power the regulation assistant.
    country_rules: [...buildCountryRules(), ...REFERENCE.rules],
    fx_rates: SEED_FX_RATES.map((r) => ({ ...r, as_of: seededAt })),
    remittance_providers: buildProviders(),
    credit_cards,
    checklist_items,
    scenario,
    seeded_at: seededAt,
  };
}

function monthsBack(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const CHECKLISTS: [ChecklistItem["country"], [string, string][]][] = [
  ["GB", [
    ["Identity document", "A valid passport with your visa or eVisa share code."],
    ["Student-status evidence", "A bank letter or enrolment letter from your university's student services."],
    ["Proof of address", "Your tenancy agreement or a university accommodation letter showing your UK address."],
    ["Local contact information", "A UK mobile number and an email address you check regularly."],
    ["Choose an account type", "Most banks offer a basic or student current account for new arrivals."],
  ]],
  ["SG", [
    ["Identity document", "NRIC, or passport with a valid Student's Pass."],
    ["Proof of address", "A recent bill or a letter from your institution."],
    ["Local mobile number", "Needed for one-time passwords and PayNow."],
  ]],
  ["US", [
    ["Identity document", "Passport with your I-20 and visa."],
    ["Proof of address", "Lease or a housing letter from your university."],
    ["Taxpayer number, if available", "An SSN or ITIN. Some banks open accounts without one for students."],
  ]],
  ["HK", [
    ["Identity document", "Passport and student visa or HKID."],
    ["Proof of address", "A utility bill or hall-of-residence letter dated within 3 months."],
    ["Student-status evidence", "An enrolment letter from your university."],
  ]],
  ["CN", [
    ["Identity document", "Passport with residence permit."],
    ["Local mobile number", "A Chinese mobile number registered to your passport."],
    ["Student-status evidence", "An admission notice or student card."],
  ]],
  ["VN", [
    ["Identity document", "Passport with valid visa or temporary residence card."],
    ["Student-status evidence", "A confirmation letter from your university."],
    ["Local mobile number", "Required for banking app verification."],
  ]],
];
