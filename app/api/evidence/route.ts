import { NextResponse } from "next/server";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Downloadable execution evidence: receipts, transfer requests, statement metadata and the audit trail. */
export async function GET() {
  try {
    const repo = await getRepository();
    const [executions, transfer_requests, audit_logs, uploads] = await Promise.all([repo.listExecutions(), repo.listTransferRequests(), repo.listAudit(), repo.listStatements()]);
    // Statement uploads: metadata only (no transactions, no file — the file is never stored).
    const statements = uploads.map((u) => ({ id: u.id, file_type: u.file_type, row_count: u.row_count, period_start: u.period_start, period_end: u.period_end, status: u.status, sha256: u.sha256, created_at: u.created_at }));
    const body = JSON.stringify({ exported_at: new Date().toISOString(), environment: "sandbox", user_id: repo.userId, executions, transfer_requests, statements, audit_logs }, null, 2);
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="caimao-evidence-${new Date().toISOString().slice(0, 10)}.json"` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
