import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { checkRegulation } from "@/lib/regulatory/service";
import { COUNTRY_CODES, CURRENCIES, RESIDENCY_STATUSES, VISA_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  source_country: z.enum(COUNTRY_CODES),
  destination_country: z.enum(COUNTRY_CODES),
  purpose: z.enum(["education", "personal"]),
  amount: z.number().positive().max(1e10).nullable().optional(),
  currency: z.enum(CURRENCIES).nullable().optional(),
  nationality: z.enum(COUNTRY_CODES).nullable().optional(),
  residency_status: z.enum(RESIDENCY_STATUSES as [string, ...string[]]).nullable().optional(),
  visa_type: z.enum(VISA_TYPES as [string, ...string[]]).nullable().optional(),
  use_profile: z.boolean().optional(),
});

/** Cross-border regulation check. Answers come only from the structured rule database. */
export async function POST(req: Request) {
  try {
    const repo = await getRepository();
    const body = Body.parse(await req.json());
    const correlationId = `rg-${randomUUID().slice(0, 8)}`;
    const result = await checkRegulation({ repo, actor: "user", correlationId }, body as Parameters<typeof checkRegulation>[1]);
    return NextResponse.json({ result, correlation_id: correlationId });
  } catch (e) {
    return errorResponse(e);
  }
}
