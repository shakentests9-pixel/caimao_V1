import { describe, expect, it } from "vitest";
import { classifyTransaction } from "@/lib/budget/classifier";
import { summarizeBudget } from "@/lib/budget/insights";
import { getFxService } from "@/lib/finance";
import { freshRepo } from "./helpers";

describe("budgeting", () => {
  it("classifies merchants without an LLM", () => {
    expect(classifyTransaction("Tesco Express", "Groceries", -10)).toBe("Food");
    expect(classifyTransaction("Northgate Student Living", "Monthly rent", -850)).toBe("Accommodation");
    expect(classifyTransaction("Stagecoach", "Student bus pass", -42)).toBe("Transportation");
    expect(classifyTransaction("Spotify", "Music subscription", -5.99)).toBe("Subscriptions");
    expect(classifyTransaction("Example University Payroll", "Library assistant — salary", 640)).toBe("Income");
    expect(classifyTransaction("Outward remittance SGD→GBP", "Top-up to UK account", -1720)).toBe("Transfers");
  });

  it("produces neutral insights from the seeded data", async () => {
    const repo = freshRepo();
    const [transactions, accounts, obligations, budgets, fx] = await Promise.all([repo.listTransactions(), repo.listAccounts(), repo.listObligations(), repo.listBudgets(), getFxService(repo)]);
    const s = summarizeBudget({ transactions, accounts, obligations, budgets, fx, currency: "GBP" });
    expect(transactions.length).toBeGreaterThanOrEqual(30);
    expect(s.insights.some((i) => /21% more on food than your three-month average/.test(i))).toBe(true);
    for (const i of s.insights) expect(i).not.toMatch(/overspen|warning|danger|bad|careless|too much/i);
    expect(s.available_after_obligations).toBeCloseTo(s.total_cash - s.upcoming_total, 2);
  });
});
