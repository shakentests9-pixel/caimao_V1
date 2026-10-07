import { afterEach, describe, expect, it } from "vitest";
import { ask, freshRepo } from "./helpers";

describe("LLM agent fallback", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("falls back to the deterministic planner when the model is unreachable, using the same tools", async () => {
    process.env.AGENT_MODE = "llm";
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9"; // nothing listens here
    const repo = freshRepo();
    const r = await ask(repo, "Pay my tuition");
    expect(r.events.some((e) => e.type === "error")).toBe(true);
    expect(r.events.filter((e) => e.type === "meta").map((e) => (e as { mode: string }).mode)).toEqual(["llm", "scripted"]);
    expect(r.cards.some((c) => c.kind === "quotes")).toBe(true);
    expect(await repo.listTransferRequests()).toHaveLength(0);
  }, 60000);
});
