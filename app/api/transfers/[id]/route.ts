import { NextResponse } from "next/server";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { DomainError } from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const tr = await repo.getTransferRequest((await params).id);
    if (!tr) throw new DomainError("NOT_FOUND", "Transfer request not found.");
    return NextResponse.json({ request: tr });
  } catch (e) {
    return errorResponse(e);
  }
}
