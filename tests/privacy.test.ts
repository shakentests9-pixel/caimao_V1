import { describe, expect, it } from "vitest";
import { parseBankStatement } from "@/lib/statements/pipeline";
import { buildAiPayload } from "@/lib/statements/ai-assist";

/**
 * Data minimisation for the optional AI category suggestions: only ambiguous card-style debits,
 * as {index, masked merchant, direction}. No amounts, dates, balances, account numbers, or
 * anything that names a person (person-to-person transfers are never sent).
 */
const CSV = [
  "Date,Description,Money out,Money in,Balance",
  "01/09/2026,KOFFIE KAMER 22 BRISTOL,4.20,,1000.00",
  "02/09/2026,FASTER PAYMENT FROM JANE DOE,,250.00,1250.00",
  "03/09/2026,TFR TO J SMITH 40329981,60.00,,1190.00",
  "04/09/2026,NORTHWIND GADGETS CARD 4421 8890 1234 5678,129.99,,1060.01",
  "05/09/2026,ZELLE TO MARK,20.00,,1040.01",
].join("\n");

describe("what the AI model may see", () => {
  it("sends only ambiguous non-personal debits, as masked merchant + direction", async () => {
    const { transactions } = await parseBankStatement(new TextEncoder().encode(CSV), "s.csv", { userId: "u", defaultCurrency: "GBP" });
    const { items } = buildAiPayload(transactions);
    const blob = JSON.stringify(items);

    // Shape: nothing but index, merchant and direction.
    for (const it of items) expect(Object.keys(it).sort()).toEqual(["direction", "i", "merchant"]);
    // No person-to-person or own-account transfers, and no credits.
    expect(blob).not.toMatch(/jane|doe|smith|mark/i);
    expect(items.every((x) => x.direction === "debit")).toBe(true);
    // No amounts, dates or full card/account numbers.
    expect(blob).not.toMatch(/129\.99|4\.20|2026|5678|40329981/);
    // The unknown shops are still eligible for a suggestion.
    expect(items.map((x) => x.merchant.toLowerCase()).join(" ")).toMatch(/koffie kamer/);
  });
});
