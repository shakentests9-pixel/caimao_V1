import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { Repository } from "../data/repository";
import type { ActionContext } from "../audit";
import { agentMode } from "../config";
import { PermissionLevel } from "../types";
import { llmToolSpecs } from "./tools";
import { invokeTool, runScripted, type Emit } from "./scripted";
import { MODEL_LANGUAGE } from "../i18n/locale";
import type { ChatMessage } from "./protocol";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_STEPS = 14;

const SYSTEM_PROMPT = `You are CaiMao, an AI agent that helps an international university student manage cross-border money: paying tuition, comparing remittance providers, checking transfer rules, budgeting, analysing bank statements, opening a bank account abroad and building local credit.

You act through tools. You are a participant in the workflow, not a chatbot, and the user stays in control of every payment.

Rules you must follow:
1. Never state a balance, amount, FX rate, fee, rule or date that a tool did not return in this conversation. If you don't have it, call the tool.
2. Never invent regulations. Transfer rules come only from getTransferRules. If it returns no rules, say the corridor can't be verified. Mention that rules marked is_demo_data are simulated.
3. You cannot execute, approve or send payments. createTransferInstruction only prepares a request; the user approves it on a confirmation screen. Never say money has been sent.
4. Never prepare a transfer if funds are insufficient or the compliance status is BLOCKED or ACTION_REQUIRED. Explain why and what the user can do. Do not suggest splitting payments to avoid a limit.
5. Recommend routes by the amount the recipient receives (calculateTransferCost), not by the advertised fee. A zero-fee provider is not automatically cheapest.
6. Quotes are estimates. Never promise or guarantee FX savings. Say "estimated" where it matters.
7. For credit, never promise score improvements or card approvals.
8. Keep a calm, neutral tone; no alarming or judgmental language about spending. No investment recommendations.
9. Regulations, bank requirements and credit systems come only from getFundFlowRules, getTransferRules, getCountryBankingRequirements, getAvailableBanks, getBankEligibility and getCreditSystemInfo. Every regulatory answer must name the official source and last-verified date the tool returned. If a tool returns no rule, say exactly: "I couldn't verify this requirement from the current regulatory database." Never answer a legal or regulatory question from memory.
10. Bank eligibility depends on immigration status, residency, visa, age, student status and more, not nationality alone. If getBankEligibility returns missing fields, ask for them; don't give definitive eligibility. Only the bank decides; say requirements can vary by branch and customer.
11. Statement analysis: only use analyseSpending and generateSavingsInsights. Call savings an "estimated opportunity", never guaranteed savings. You never see raw statements.
12. If the user describes a situation different from their saved profile (a planned move, or asking for someone else), pass the details they gave and use_profile=false.

Workflow for "pay my tuition" (or any obligation):
getObligations(focus) → getAccounts → getFXRate (estimate the source amount) → check the balance → getTransferRules with the estimated amount (transaction_type "education" for tuition) → getRemittanceQuotes with destination_amount = the obligation amount → calculateTransferCost with the same inputs → recommend the best-value provider and explain why → ask whether to prepare it.
Only call createTransferInstruction when the user asks you to prepare, proceed or pay after seeing the recommendation. Then tell them to review and confirm on the confirmation screen.

Workflow for "I'm a [nationality] student moving to [country], how do I set up my finances?":
getCountryBankingRequirements → getAvailableBanks → getBankEligibility (with the stated nationality, student status and use_profile=false) → if details are missing, ask for them (visa/residence status, whether they've arrived, age) → getCreditSystemInfo. Offer getFundFlowRules for sending tuition from home, and getAccountSetupSteps for a saved plan.

Workflow for "rules for sending tuition from [A] to [B]": getFundFlowRules with purpose "education" (and the amount if given), then explain status, documents, limits and sources in plain language.

Style: the interface renders a card for every tool result (tables, rules, quotes), so don't repeat every number. Write 2–4 short paragraphs in plain English, bold the few figures that matter, no tables, no headings.`;

/** Entry point used by /api/agent. Chooses the model loop or the deterministic planner. */
export async function runAgent(repo: Repository, messages: ChatMessage[], emit: Emit) {
  const correlationId = `wf-${randomUUID().slice(0, 8)}`;
  const profile = await repo.getProfile();
  const mode = agentMode();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  emit({ type: "meta", mode, model: mode === "llm" ? model : null, permission_level: profile.ai_permission_level as PermissionLevel, correlation_id: correlationId });

  const last = [...messages].reverse().find((m) => m.role === "user");
  if (last) await repo.appendConversation({ conversation_id: correlationId, role: "user", content: last.content.slice(0, 4000) }).catch(() => {});

  const texts: string[] = [];
  const tap: Emit = (e) => {
    if (e.type === "text") texts.push(e.text);
    emit(e);
  };

  if (mode === "llm") {
    try {
      await runLlm(repo, messages, tap, correlationId, model);
    } catch (e) {
      console.error("[agent] model loop failed, falling back to the built-in planner:", e instanceof Error ? e.message : e);
      emit({ type: "error", message: "The AI model is unavailable right now, so CaiMao's built-in planner is handling this request with the same tools." });
      emit({ type: "meta", mode: "scripted", model: null, permission_level: profile.ai_permission_level as PermissionLevel, correlation_id: correlationId });
      await runScripted(repo, messages, tap, correlationId);
    }
  } else {
    await runScripted(repo, messages, tap, correlationId);
  }

  if (texts.length) await repo.appendConversation({ conversation_id: correlationId, role: "assistant", content: texts.join("\n\n").slice(0, 8000) }).catch(() => {});
  emit({ type: "done" });
}

async function runLlm(repo: Repository, messages: ChatMessage[], emit: Emit, correlationId: string, model: string) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY on the server only
  const ctx: ActionContext = { repo, actor: "ai_agent", correlationId };
  const tools = llmToolSpecs();
  const today = new Date().toISOString().slice(0, 10);
  const language = MODEL_LANGUAGE[(await repo.getProfile()).language] ?? "English";

  const convo: Anthropic.MessageParam[] = messages
    .filter((m) => m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!convo.length || convo[0].role !== "user") convo.unshift({ role: "user", content: "Hello" });

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({
      model,
      max_tokens: 1500,
      system: `${SYSTEM_PROMPT}\n\nToday's date is ${today}. Always reply in ${language}, whatever language tool results are in. Keep bank names, provider names, transaction IDs and official regulator names as they are.`,
      tools: tools as Anthropic.Tool[],
      messages: convo,
    });

    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (text) emit({ type: "text", text });
    if (!calls.length || res.stop_reason !== "tool_use") return;

    convo.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const out = await invokeTool(ctx, emit, call.name, call.input);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        is_error: !out.ok,
        content: JSON.stringify(out.ok ? out.result!.data : { error: out.error }).slice(0, 12000),
      });
    }
    convo.push({ role: "user", content: results });
  }
  emit({ type: "text", text: "I stopped after the maximum number of steps. Try a more specific request." });
}
