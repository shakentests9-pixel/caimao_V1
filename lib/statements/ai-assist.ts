import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { agentMode } from "../config";
import { DEFAULT_MODEL } from "../agent/orchestrator";
import type { StatementTransaction, TransactionCategory } from "../types";

const ALLOWED: TransactionCategory[] = [
  "Accommodation", "Food", "Transportation", "Education", "Entertainment", "Travel", "Subscriptions", "Shopping", "Healthcare", "Fees", "Transfers", "Income", "Other",
];

/**
 * Optional AI suggestions for rows the rules couldn't classify.
 * Data boundary: only the masked merchant name and the direction are sent, for debits that
 * aren't person-to-person transfers —
 * no dates, amounts, balances, account hints, names or the raw statement. Suggestions
 * stay flagged for the user's review and are labelled "AI suggestion" in the UI.
 * Without an API key (or on any error) the rows are returned unchanged.
 */
/** Person-to-person and own-account transfers can carry someone's name: never sent to the model. */
const PERSONAL = /\b(from|to)\s+[a-z]|\b(transfer|tfr|trf|faster payment|fps|paynow|zelle|venmo|bacs|standing order|so)\b|转账|汇款|振込/i;

/**
 * Exactly what may leave CaiMao for an AI category suggestion: fallback-classified debits whose
 * merchant isn't a person, as {index, masked merchant, direction}. Pure, so it's unit-tested.
 */
export function buildAiPayload(rows: StatementTransaction[]) {
  const ambiguous = rows
    .filter((r) => r.category_source === "fallback" && r.direction === "debit" && !PERSONAL.test(r.merchant) && !PERSONAL.test(r.description))
    .slice(0, 40);
  return { ambiguous, items: ambiguous.map((r, i) => ({ i, merchant: r.merchant.slice(0, 60), direction: r.direction })) };
}

export async function suggestCategories(rows: StatementTransaction[]): Promise<{ rows: StatementTransaction[]; sent: number }> {
  const { ambiguous, items } = buildAiPayload(rows);
  if (!ambiguous.length || agentMode() !== "llm") return { rows, sent: 0 };

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 800,
      system:
        "You label bank-statement merchants with a spending category. Reply with JSON only: an array of {\"i\": number, \"category\": string}. " +
        `Allowed categories: ${ALLOWED.join(", ")}. If unsure, use "Other".`,
      messages: [{ role: "user", content: JSON.stringify(items) }],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "[]";
    const json = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as { i: number; category: string }[];
    const byIndex = new Map(json.filter((x) => ALLOWED.includes(x.category as TransactionCategory)).map((x) => [x.i, x.category as TransactionCategory]));
    const updated = rows.map((r) => {
      const k = ambiguous.indexOf(r);
      const cat = k >= 0 ? byIndex.get(k) : undefined;
      if (!cat || cat === r.category) return r;
      if (cat === "Income" && r.amount < 0) return r;
      return { ...r, category: cat, category_source: "ai" as const, confidence: 0.6, needs_review: true };
    });
    return { rows: updated, sent: items.length };
  } catch (e) {
    console.error("[statements] AI suggestion skipped:", e instanceof Error ? e.message : e);
    return { rows, sent: 0 };
  }
}
