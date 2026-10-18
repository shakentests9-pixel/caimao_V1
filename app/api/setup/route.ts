import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { chooseBank, createActionPlan, setStep } from "@/lib/banking/service";
import { SUPPORTED_COUNTRIES } from "@/lib/types";
import { STEP_KEYS } from "@/lib/banking/journey";

export const dynamic = "force-dynamic";

/** Creates (or refreshes) the personalised Financial Setup plan and records ACTION_PLAN_CREATED. */
export async function POST(req: Request) {
  try {
    const repo = await getRepository();
    const { country } = z.object({ country: z.enum(SUPPORTED_COUNTRIES).optional() }).parse(await req.json().catch(() => ({})));
    const journey = await createActionPlan({ repo, actor: "user", correlationId: `fs-${randomUUID().slice(0, 8)}` }, country);
    return NextResponse.json({ journey });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Ticks or unticks a step. */
export async function PATCH(req: Request) {
  try {
    const repo = await getRepository();
    const raw = await req.json();
    if ("bank_id" in raw) {
      const b = z.object({ country: z.enum(SUPPORTED_COUNTRIES), bank_id: z.string().max(80).nullable() }).parse(raw);
      await chooseBank({ repo, actor: "user", correlationId: null }, b.country, b.bank_id);
      return NextResponse.json({ ok: true });
    }
    const body = z.object({ country: z.enum(SUPPORTED_COUNTRIES), step: z.enum(STEP_KEYS), completed: z.boolean() }).parse(raw);
    await setStep({ repo, actor: "user", correlationId: null }, body.country, body.step, body.completed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
