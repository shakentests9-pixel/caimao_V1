import type { Repository } from "./data/repository";
import type { AuditAction, AuditLog } from "./types";
import { PermissionLevel } from "./types";

export interface ActionContext {
  repo: Repository;
  actor: AuditLog["actor"];
  /** Groups every event from one workflow run on the Execution Evidence page. */
  correlationId: string | null;
}

export async function audit(
  ctx: ActionContext,
  action: AuditAction,
  e: {
    tool?: string | null;
    level?: PermissionLevel;
    details?: Record<string, unknown>;
    approval?: AuditLog["approval_status"];
    result?: AuditLog["result"];
    actor?: AuditLog["actor"];
  } = {},
) {
  return ctx.repo.appendAudit({
    actor: e.actor ?? ctx.actor,
    action,
    tool: e.tool ?? null,
    permission_level: e.level ?? PermissionLevel.Read,
    details: e.details ?? {},
    approval_status: e.approval ?? "NOT_REQUIRED",
    result: e.result ?? "SUCCESS",
    correlation_id: ctx.correlationId,
  });
}
