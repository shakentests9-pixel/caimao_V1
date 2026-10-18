import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { bankingGuidance } from "@/lib/banking/service";
import { SUPPORTED_COUNTRIES } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({ country: z.enum(SUPPORTED_COUNTRIES) });

/** Bank options and eligibility guidance for the user's saved profile in one study country. */
export async function POST(req: Request) {
  try {
    const repo = await getRepository();
    const { country } = Body.parse(await req.json());
    const result = await bankingGuidance({ repo, actor: "user", correlationId: `bk-${randomUUID().slice(0, 8)}` }, { country });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
