import { NextResponse } from "next/server";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { confirmImport } from "@/lib/statements/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user confirms the previewed transactions; only then is the analysis created and saved. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const { id } = await params;
    return NextResponse.json(await confirmImport(repo, id));
  } catch (e) {
    return errorResponse(e);
  }
}
