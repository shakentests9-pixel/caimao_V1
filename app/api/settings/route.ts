import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/session";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/audit";
import { CURRENCIES } from "@/lib/types";

export const dynamic = "force-dynamic";

// Level 3 cannot be granted as a standing permission: every execution needs its own approval.
const Body = z.object({
  base_currency: z.enum(CURRENCIES).optional(),
  ai_permission_level: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  documents_on_file: z.array(z.string().max(80)).max(20).optional(),
});

export async function POST(req: Request) {
  try {
    const repo = await getRepository();
    const patch = Body.parse(await req.json());
    const profile = await repo.updateProfile(patch);
    await audit({ repo, actor: "user", correlationId: null }, "SETTINGS_CHANGED", { level: 0, details: patch });
    return NextResponse.json({ profile });
  } catch (e) {
    return errorResponse(e);
  }
}
