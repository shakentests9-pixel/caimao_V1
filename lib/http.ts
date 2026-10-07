import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "./finance";
import { UnauthorizedError } from "./session";

const STATUS: Record<DomainError["code"], number> = {
  NOT_FOUND: 404,
  PERMISSION_DENIED: 403,
  APPROVAL_REQUIRED: 403,
  INSUFFICIENT_FUNDS: 422,
  COMPLIANCE_BLOCKED: 422,
  COMPLIANCE_ACTION_REQUIRED: 422,
  INVALID_STATE: 409,
  EXPIRED: 410,
  PROVIDER_UNAVAILABLE: 422,
  PAYMENT_FAILED: 502,
};

/** Maps domain errors to JSON responses without leaking internals. */
export function errorResponse(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message, code: "UNAUTHORIZED" }, { status: 401 });
  if (e instanceof DomainError) return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: STATUS[e.code] });
  if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request.", code: "BAD_REQUEST", issues: e.issues }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong on the server.", code: "INTERNAL" }, { status: 500 });
}
