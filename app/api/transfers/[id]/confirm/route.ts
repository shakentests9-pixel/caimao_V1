import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { approveTransfer, executeSandboxTransfer } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ acknowledged: z.literal(true), correlation_id: z.string().max(64).nullable().optional() });

/**
 * The only route that moves money. The signed-in user approves (Level 3 gate),
 * then the agent's executeSandboxTransfer runs against the approved request.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const { id } = await params;
    const body = Body.parse(await req.json());
    const correlationId = body.correlation_id ?? null;
    await approveTransfer({ repo, actor: "user", correlationId }, { transfer_request_id: id, acknowledged: body.acknowledged });
    const execution = await executeSandboxTransfer({ repo, actor: "ai_agent", correlationId }, id);
    return NextResponse.json({ execution });
  } catch (e) {
    return errorResponse(e);
  }
}
