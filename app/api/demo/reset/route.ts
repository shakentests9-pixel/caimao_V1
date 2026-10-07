import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({ scenario: z.enum(["standard", "insufficient_funds", "over_limit"]).default("standard") });

export async function POST(req: Request) {
  try {
    const repo = await getRepository();
    const { scenario } = Body.parse(await req.json().catch(() => ({})));
    await repo.reset(scenario);
    await audit({ repo, actor: "user", correlationId: null }, "DEMO_RESET", { level: 0, details: { scenario } });
    return NextResponse.json({ ok: true, scenario });
  } catch (e) {
    return errorResponse(e);
  }
}
