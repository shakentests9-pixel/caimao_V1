import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { DomainError } from "@/lib/finance";
import { deleteStatement, recategorise } from "@/lib/statements/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["Income", "Accommodation", "Food", "Transportation", "Education", "Entertainment", "Travel", "Subscriptions", "Shopping", "Healthcare", "Fees", "Other", "Transfers"] as const;
const Patch = z.object({
  changes: z.array(z.object({ id: z.string().max(40), category: z.enum(CATEGORIES).optional(), included: z.boolean().optional() })).max(5000),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const { id } = await params;
    const upload = await repo.getStatement(id);
    if (!upload) throw new DomainError("NOT_FOUND", "Statement not found.");
    const [transactions, analysis] = await Promise.all([repo.listStatementTransactions(id), repo.getStatementAnalysis(id)]);
    return NextResponse.json({ upload, transactions, analysis: analysis?.result ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Category corrections and include/exclude toggles from the review table. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const { id } = await params;
    const { changes } = Patch.parse(await req.json());
    await recategorise(repo, id, changes);
    const [upload, transactions, analysis] = await Promise.all([repo.getStatement(id), repo.listStatementTransactions(id), repo.getStatementAnalysis(id)]);
    return NextResponse.json({ upload, transactions, analysis: analysis?.result ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}

/** User-controlled deletion: removes the rows and the analysis. The audit trail keeps a record that it happened. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repo = await getRepository();
    const { id } = await params;
    await deleteStatement(repo, id);
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return errorResponse(e);
  }
}
