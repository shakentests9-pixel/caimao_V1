import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const { completed } = z.object({ completed: z.boolean() }).parse(await req.json());
    await repo.setChecklistItem((await params).id, completed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
