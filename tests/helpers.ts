import { MemoryRepository, resetMemoryStore } from "@/lib/data/memory";
import type { SeedScenario } from "@/lib/seed";
import { runAgent } from "@/lib/agent/orchestrator";
import type { AgentEvent } from "@/lib/agent/protocol";
import type { ActionContext } from "@/lib/audit";

export function freshRepo(scenario: SeedScenario["id"] = "standard") {
  resetMemoryStore(scenario);
  return new MemoryRepository();
}

export const agentCtx = (repo: MemoryRepository): ActionContext => ({ repo, actor: "ai_agent", correlationId: "test-run" });
export const userCtx = (repo: MemoryRepository): ActionContext => ({ repo, actor: "user", correlationId: "test-run" });

export async function ask(repo: MemoryRepository, text: string) {
  const events: AgentEvent[] = [];
  await runAgent(repo, [{ role: "user", content: text }], (e) => events.push(e));
  const tools = events.filter((e): e is Extract<AgentEvent, { type: "tool_end" }> => e.type === "tool_end");
  const cards = events.filter((e): e is Extract<AgentEvent, { type: "card" }> => e.type === "card").map((e) => e.card);
  const text_ = events.filter((e): e is Extract<AgentEvent, { type: "text" }> => e.type === "text").map((e) => e.text).join("\n");
  return { events, tools, cards, text: text_ };
}

export const sgdBalance = async (repo: MemoryRepository) => (await repo.listAccounts()).find((a) => a.currency === "SGD")!.balance;
export const tuition = async (repo: MemoryRepository) => (await repo.listObligations()).find((o) => o.kind === "tuition")!;
