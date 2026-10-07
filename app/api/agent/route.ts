import { z } from "zod";
import { getRepository } from "@/lib/session";
import { runAgent } from "@/lib/agent/orchestrator";
import { errorResponse } from "@/lib/http";
import type { AgentEvent } from "@/lib/agent/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(40),
});

/** Streams the agent's steps, cards and replies as newline-delimited JSON. */
export async function POST(req: Request) {
  let repo, body;
  try {
    repo = await getRepository();
    body = Body.parse(await req.json());
  } catch (e) {
    return errorResponse(e);
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(repo, body.messages, emit);
      } catch (e) {
        console.error(e);
        emit({ type: "error", message: "The agent stopped unexpectedly. No payment was made." });
        emit({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
