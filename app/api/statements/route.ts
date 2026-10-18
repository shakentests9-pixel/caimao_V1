import { NextResponse } from "next/server";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { DomainError } from "@/lib/finance";
import { uploadStatement } from "@/lib/statements/service";
import { MAX_STATEMENT_BYTES } from "@/lib/statements/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lists the user's statement uploads (metadata only). */
export async function GET() {
  try {
    const repo = await getRepository();
    return NextResponse.json({ statements: await repo.listStatements() });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Upload + parse. The file is read into memory, parsed on the server and discarded:
 * it is never written to disk or storage and never gets a URL. Requires consent=true.
 */
export async function POST(req: Request) {
  try {
    const repo = await getRepository();
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_STATEMENT_BYTES + 64 * 1024) throw new DomainError("INVALID_FILE", "The file is larger than 4 MB.", { reason: "TOO_LARGE" });
    const form = await req.formData();
    const file = form.get("file");
    const consent = form.get("consent") === "true";
    if (!(file instanceof File)) throw new DomainError("INVALID_FILE", "Choose a CSV or PDF statement to upload.", { reason: "EMPTY" });
    if (file.size > MAX_STATEMENT_BYTES) throw new DomainError("INVALID_FILE", "The file is larger than 4 MB.", { reason: "TOO_LARGE" });
    if (!consent) throw new DomainError("CONSENT_REQUIRED", "Please agree to let CaiMao read this statement first.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadStatement(repo, { bytes, fileName: file.name, consent });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
