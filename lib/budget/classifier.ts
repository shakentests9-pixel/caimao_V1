import type { TransactionCategory } from "../types";

/**
 * Rule-based transaction classifier. Deterministic and explainable, so the
 * categories on the Budget page never depend on an LLM call.
 */
const RULES: { category: TransactionCategory; patterns: RegExp[] }[] = [
  { category: "Transfers", patterns: [/remittance/i, /top-up/i, /wise|revolut/i] },
  { category: "Income", patterns: [/payroll/i, /salary/i, /allowance/i, /family support/i] },
  { category: "Accommodation", patterns: [/rent/i, /student living/i, /accommodation/i, /halls?/i] },
  { category: "Food", patterns: [/tesco/i, /sainsbury/i, /pret/i, /deliveroo/i, /uber eats/i, /groceries/i, /restaurant|cafe|coffee/i] },
  { category: "Transportation", patterns: [/stagecoach/i, /trainline/i, /tfl/i, /bus|rail|train/i, /uber(?! eats)/i] },
  { category: "Education", patterns: [/bookshop|textbook/i, /university(?!.*payroll)/i, /tuition/i, /course/i] },
  { category: "Entertainment", patterns: [/cinema|odeon/i, /ticketmaster|concert/i, /steam|playstation/i] },
  { category: "Travel", patterns: [/easyjet|ryanair|british airways|airline|flight/i, /hotel|airbnb/i] },
  { category: "Subscriptions", patterns: [/spotify|netflix|disney\+|apple\.com/i, /giffgaff|mobile plan/i, /subscription/i] },
];

export function classifyTransaction(merchant: string, description: string, amount: number): TransactionCategory {
  const text = `${merchant} ${description}`;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      if (rule.category === "Income" && amount < 0) continue;
      return rule.category;
    }
  }
  return amount > 0 ? "Income" : "Transfers";
}

export const SPENDING_CATEGORIES: Exclude<TransactionCategory, "Income">[] = [
  "Accommodation",
  "Food",
  "Transportation",
  "Education",
  "Entertainment",
  "Travel",
  "Subscriptions",
  "Transfers",
];
