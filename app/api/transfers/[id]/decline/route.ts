import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { declineTransfer } from "@/lib/finance";

export const dynamic = "force-dynamic";

const Body = z.object({ correlation_id: z.string().max(64).nullable().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const body = Body.parse(await req.json().catch(() => ({})));
    const tr = await declineTransfer({ repo, actor: "user", correlationId: body.correlation_id ?? null }, (await params).id);
    return NextResponse.json({ request: tr });
  } catch (e) {
    return errorResponse(e);
  }
}
