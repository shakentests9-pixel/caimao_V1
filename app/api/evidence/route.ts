import { NextResponse } from "next/server";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Downloadable execution evidence: receipts, transfer requests and the audit trail. */
export async function GET() {
  try {
    const repo = await getRepository();
    const [executions, transfer_requests, audit_logs] = await Promise.all([repo.listExecutions(), repo.listTransferRequests(), repo.listAudit()]);
    const body = JSON.stringify({ exported_at: new Date().toISOString(), environment: "sandbox", user_id: repo.userId, executions, transfer_requests, audit_logs }, null, 2);
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="caimao-evidence-${new Date().toISOString().slice(0, 10)}.json"` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
