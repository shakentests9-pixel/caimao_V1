import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { buildQuoteSet } from "@/lib/finance";
import { compareQuotes } from "@/lib/remittance/engine";
import { CURRENCIES } from "@/lib/types";

export const dynamic = "force-dynamic";

const Query = z.object({
  from: z.enum(CURRENCIES),
  to: z.enum(CURRENCIES),
  amount: z.coerce.number().positive().max(10_000_000),
});

/**
 * Read-only quotes for the Transfers calculator. Uses the same deterministic
 * engine as the agent's tools, but writes nothing and logs nothing: browsing
 * rates isn't a financial action.
 */
export async function GET(req: Request) {
  try {
    const repo = await getRepository();
    const url = new URL(req.url);
    const q = Query.parse({ from: url.searchParams.get("from"), to: url.searchParams.get("to"), amount: url.searchParams.get("amount") });
    const set = await buildQuoteSet(repo, { source_currency: q.from, destination_currency: q.to, source_amount: q.amount });
    const cmp = compareQuotes(set.quotes);
    return NextResponse.json({
      quotes: cmp.quotes,
      delivery_quotes: [],
      best_provider_id: cmp.best?.provider_id ?? null,
      lowest_fee_provider_id: cmp.lowest_advertised_fee?.provider_id ?? null,
      compare_amount: set.compare_amount,
      destination_amount: null,
      explanation: cmp.explanation,
      advantage_vs: cmp.advantage_vs,
      fx_as_of: set.fx_as_of,
      fx_source: set.fx_source,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
