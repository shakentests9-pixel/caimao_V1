"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronDown, CircleX, GraduationCap, Loader2, Plus, RefreshCw, RotateCcw, Scale, ShieldCheck, PieChart } from "lucide-react";
import type { AgentCard, AgentEvent, Phase } from "@/lib/agent/protocol";
import { PHASES } from "@/lib/agent/protocol";
import type { ExecutionOutcome } from "@/lib/finance";
import { PermissionLevel } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { AgentProgress, type PhaseState } from "./workflow-rail";
import { AgentCardView, PaymentSnapshot } from "./agent-cards";
import { Markdown } from "./markdown";
import { PermissionChip } from "./permission-chip";
import { ConfirmTransferDialog, type ConfirmTarget } from "./confirm-transfer";
import type { Status } from "./status-badge";
import { MascotTile } from "./brand";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = ["Pay my tuition", "Compare rates", "Can I afford this?", "Check transfer rules"];
const MORE_ACTIONS = ["Pay my tuition", "Compare FX rates", "Send money overseas", "Check transfer rules", "Review my spending", "Help me build credit", "Open a local bank account"];
const STARTERS = [
  { prompt: "Pay my tuition", title: "Pay my tuition", sub: "Find the best route and get it ready for you to approve", Icon: GraduationCap, tone: "bg-brand-soft text-brand" },
  { prompt: "Compare FX rates", title: "Compare rates", sub: "See what actually arrives with each provider", Icon: RefreshCw, tone: "bg-peach-soft text-peach-ink" },
  { prompt: "Check transfer rules", title: "Check transfer rules", sub: "What applies between Singapore and the UK", Icon: Scale, tone: "bg-gold-soft text-gold-ink" },
  { prompt: "Review my spending", title: "Review my spending", sub: "How this month compares to usual", Icon: PieChart, tone: "bg-cream text-warning-ink" },
];

/** Human wording for each tool. The technical name stays visible in the expanded view. */
const FRIENDLY: Record<string, { running: string; done: string; summary?: boolean }> = {
  getUserProfile: { running: "Getting to know your setup", done: "Read your profile" },
  getObligations: { running: "Looking at what's due", done: "Found what's due", summary: true },
  getAccounts: { running: "Checking your accounts", done: "Checked your accounts", summary: true },
  getFXRate: { running: "Getting today's rate", done: "Got today's rate" },
  getTransferRules: { running: "Checking transfer requirements", done: "Transfer requirements checked", summary: true },
  getRemittanceQuotes: { running: "Getting quotes", done: "Got provider quotes", summary: true },
  calculateTransferCost: { running: "Comparing the true cost", done: "Compared the true cost", summary: true },
  createTransferInstruction: { running: "Preparing your transfer", done: "Prepared your transfer", summary: true },
  getTransactions: { running: "Reviewing your spending", done: "Reviewed your spending", summary: true },
  getCreditSummary: { running: "Checking your credit card", done: "Checked your credit card", summary: true },
  getBankSetupChecklist: { running: "Loading your checklist", done: "Loaded your checklist", summary: true },
  USER_APPROVAL: { running: "Recording your approval", done: "You approved the payment", summary: true },
  executeSandboxTransfer: { running: "Sending the payment", done: "Sent the payment (sandbox)", summary: true },
  updateAccountBalance: { running: "Updating your balance", done: "Updated your balance", summary: true },
  markObligationPaid: { running: "Marking tuition paid", done: "Marked tuition paid", summary: true },
  createAuditLog: { running: "Saving the receipt", done: "Saved to Activity & Security", summary: true },
};

interface Step {
  id: string;
  tool: string;
  label: string;
  level: PermissionLevel;
  phase: Phase;
  status: "running" | "ok" | "error";
  summary?: string;
}

type Block =
  | { kind: "steps"; steps: Step[]; inline?: boolean }
  | { kind: "card"; card: AgentCard; key: string }
  | { kind: "text"; text: string }
  | { kind: "notice"; tone: "error" | "info"; text: string };

type RenderBlock = Block | { kind: "snapshot"; key: string };

interface UserMsg {
  id: string;
  role: "user";
  text: string;
}
interface AssistantMsg {
  id: string;
  role: "assistant";
  blocks: Block[];
  suggestions: string[];
  correlationId: string | null;
  mode: "llm" | "scripted" | null;
  model: string | null;
  done: boolean;
  phases: Partial<Record<Phase, PhaseState>>;
}
type Msg = UserMsg | AssistantMsg;

const STORAGE_KEY = "caimao.copilot.v1";
const uid = () => Math.random().toString(36).slice(2, 10);

function textOf(m: Msg) {
  return m.role === "user" ? m.text : m.blocks.filter((b): b is Extract<Block, { kind: "text" }> => b.kind === "text").map((b) => b.text).join("\n\n");
}

/** Applies one streamed event to the assistant message being built. */
function reduce(m: AssistantMsg, e: AgentEvent): AssistantMsg {
  const blocks = [...m.blocks];
  const phases = { ...m.phases };
  const markActive = (p: Phase) => {
    if (phases[p] !== "done" && phases[p] !== "stopped") phases[p] = "active";
  };
  switch (e.type) {
    case "meta":
      return { ...m, correlationId: e.correlation_id, mode: e.mode, model: e.model };
    case "phase":
      markActive(e.phase);
      return { ...m, phases };
    case "tool_start": {
      const last = blocks[blocks.length - 1];
      const step: Step = { id: e.id, tool: e.tool, label: e.label, level: e.level, phase: e.phase, status: "running" };
      if (last?.kind === "steps" && !last.inline) blocks[blocks.length - 1] = { kind: "steps", steps: [...last.steps, step] };
      else blocks.push({ kind: "steps", steps: [step] });
      markActive(e.phase);
      return { ...m, blocks, phases };
    }
    case "tool_end": {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.kind === "steps" && b.steps.some((s) => s.id === e.id)) {
          blocks[i] = { ...b, steps: b.steps.map((s) => (s.id === e.id ? { ...s, status: e.ok ? "ok" : "error", summary: e.summary } : s)) };
          break;
        }
      }
      phases[e.phase] = e.ok ? "done" : "stopped";
      return { ...m, blocks, phases };
    }
    case "card": {
      blocks.push({ kind: "card", card: e.card, key: uid() });
      if (e.card.kind === "quotes" && e.card.best_provider_id) phases.Recommend = "done";
      if (e.card.kind === "instruction") phases["Obtain approval"] = "active";
      if (e.card.kind === "blocked" || (e.card.kind === "funds" && !e.card.sufficient)) {
        const lastStep = [...blocks].reverse().find((b): b is Extract<Block, { kind: "steps" }> => b.kind === "steps")?.steps.at(-1);
        if (lastStep) phases[lastStep.phase] = "stopped";
      }
      return { ...m, blocks, phases };
    }
    case "text":
      blocks.push({ kind: "text", text: e.text });
      return { ...m, blocks };
    case "error":
      blocks.push({ kind: "notice", tone: "error", text: e.message });
      return { ...m, blocks };
    case "suggestions":
      return { ...m, suggestions: e.items };
    case "done":
      for (const p of PHASES) if (phases[p] === "active" && p !== "Obtain approval") phases[p] = "done";
      return { ...m, done: true, phases };
  }
}

export function Copilot({ initialPrompt, permissionLevel, firstName }: { initialPrompt: string | null; permissionLevel: PermissionLevel; firstName: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<{ target: ConfirmTarget; correlationId: string | null; msgId: string } | null>(null);
  const [instructionStatus, setInstructionStatus] = useState<Record<string, Status>>({});
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);
  const correlationRef = useRef<Record<string, string>>({});

  // Restore the conversation when navigating back to the page.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setMessages(saved.messages ?? []);
        setInstructionStatus(saved.instructionStatus ?? {});
      }
    } catch {
      /* storage unavailable */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.filter((m) => m.role === "user" || m.done), instructionStatus }));
    } catch {
      /* storage unavailable */
    }
  }, [messages, instructionStatus, loaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const updateAssistant = (id: string, fn: (m: AssistantMsg) => AssistantMsg) =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === "assistant" ? fn(m) : m)));

  const send = useCallback(
    async (text: string, opts: { fresh?: boolean } = {}) => {
      const content = text.trim();
      if (!content || busy) return;
      setBusy(true);
      setMenu(false);
      setInput("");
      const user: UserMsg = { id: uid(), role: "user", text: content };
      const asst: AssistantMsg = { id: uid(), role: "assistant", blocks: [], suggestions: [], correlationId: null, mode: null, model: null, done: false, phases: {} };
      const history = opts.fresh ? [] : messages;
      setMessages([...history, user, asst]);
      if (opts.fresh) setInstructionStatus({});

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...history, user].map((m) => ({ role: m.role, content: textOf(m) || "(tool results shown)" })).slice(-20) }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 401) router.push("/login");
          throw new Error(body.error ?? "CaiMao couldn't be reached.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as AgentEvent;
            updateAssistant(asst.id, (m) => reduce(m, ev));
            if (ev.type === "meta") correlationRef.current[asst.id] = ev.correlation_id;
            if (ev.type === "card" && ev.card.kind === "instruction") {
              const card = ev.card;
              // Open the confirmation screen once the instruction lands; the user still has to approve.
              setTimeout(() => {
                setConfirm({
                  target: { request: card.request, provider_name: card.provider_name, account_label: card.account_label, obligation_title: card.obligation_title },
                  correlationId: correlationRef.current[asst.id] ?? null,
                  msgId: asst.id,
                });
              }, 900);
            }
          }
        }
        updateAssistant(asst.id, (m) => (m.done ? m : reduce(m, { type: "done" })));
      } catch (err) {
        updateAssistant(asst.id, (m) => ({ ...reduce(m, { type: "error", message: err instanceof Error ? err.message : "Something went wrong." }), done: true }));
      } finally {
        setBusy(false);
        router.refresh();
      }
    },
    [busy, messages, router],
  );

  useEffect(() => {
    if (!loaded || sentInitial.current || !initialPrompt) return;
    sentInitial.current = true;
    router.replace("/copilot", { scroll: false });
    send(initialPrompt, { fresh: true });
  }, [loaded, initialPrompt, send, router]);

  // One tracker across the conversation, so a two-turn workflow reads as one journey.
  const phases = useMemo(() => {
    const out: Partial<Record<Phase, PhaseState>> = {};
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const p of PHASES) {
        const s = m.phases[p];
        if (!s) continue;
        if (s === "stopped" || out[p] === undefined || (out[p] === "active" && s === "done") || (out[p] === "pending" && s !== "pending")) out[p] = s;
        if (s === "done" && out[p] === "stopped") out[p] = "done";
      }
    }
    return out;
  }, [messages]);

  function onCompleted(e: ExecutionOutcome) {
    if (!confirm) return;
    const { msgId, target } = confirm;
    const tuition = /tuition/i.test(target.obligation_title ?? target.request.purpose);
    setInstructionStatus((s) => ({ ...s, [target.request.id]: "COMPLETED" }));
    updateAssistant(msgId, (m) => ({
      ...m,
      phases: { ...m.phases, "Obtain approval": "done", Execute: "done", Verify: "done" },
      blocks: [
        ...m.blocks,
        {
          kind: "steps",
          inline: true,
          steps: [
            { id: uid(), tool: "USER_APPROVAL", label: "Approval recorded", level: PermissionLevel.Execute, phase: "Obtain approval", status: "ok", summary: "You confirmed on the review screen" },
            { id: uid(), tool: "executeSandboxTransfer", label: "Executing sandbox transfer", level: PermissionLevel.Execute, phase: "Execute", status: "ok", summary: `${e.transaction_id} · COMPLETED · ref ${e.provider_reference}` },
            { id: uid(), tool: "updateAccountBalance", label: "Updating balances", level: PermissionLevel.Execute, phase: "Verify", status: "ok", summary: `${e.account} → ${formatMoney(e.new_balance, e.source_currency)}` },
            ...(e.obligation_status === "PAID"
              ? [{ id: uid(), tool: "markObligationPaid", label: "Marking the obligation paid", level: PermissionLevel.Execute, phase: "Verify" as Phase, status: "ok" as const, summary: `${target.request.invoice_ref} → PAID` }]
              : []),
            { id: uid(), tool: "createAuditLog", label: "Writing the audit log", level: PermissionLevel.Execute, phase: "Verify", status: "ok", summary: "Approval, execution, balance and obligation events recorded" },
          ],
        },
        {
          kind: "text",
          text: `Done${tuition ? ", your tuition is paid 🎓" : ""}. **${formatMoney(e.destination_amount, e.destination_currency)}** is on its way to ${e.recipient.replace(" Treasury", "")} via ${e.provider} (transaction **${e.transaction_id}**).\n\nI double-checked: ${e.account} now holds **${formatMoney(e.new_balance, e.source_currency)}**${e.obligation_status === "PAID" ? ` and ${target.request.invoice_ref} is marked **paid**` : ""}. The full trail is in Activity & Security.`,
        },
      ],
      suggestions: ["Review my spending", "Help me build credit"],
    }));
  }

  function onDeclined() {
    if (!confirm) return;
    const { msgId, target } = confirm;
    setInstructionStatus((s) => ({ ...s, [target.request.id]: "CANCELLED" }));
    updateAssistant(msgId, (m) => ({
      ...m,
      phases: { ...m.phases, "Obtain approval": "stopped" },
      blocks: [...m.blocks, { kind: "text", text: "No problem. I've cancelled it and **no money moved**. Ask me again whenever you're ready." }],
    }));
  }

  const lastAssistant = [...messages].reverse().find((m): m is AssistantMsg => m.role === "assistant");
  const empty = messages.length === 0;
  const working = busy;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-160px)] max-w-[860px] flex-col lg:min-h-[calc(100dvh-64px)]">
      {/* Header + progress */}
      <div className="sticky top-16 z-20 -mx-4 bg-ivory/90 px-4 pb-3 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:px-0 lg:pt-0">
        <div className="rounded-[24px] bg-white px-4 py-3.5 shadow-card sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <MascotTile size={40} />
              <div className="min-w-0">
                <h1 className="font-display text-[20px] font-extrabold leading-tight tracking-[-0.05em] text-cocoa">CaiMao</h1>
                <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-muted">
                  {working ? <span className="size-1.5 animate-pulse-soft rounded-full bg-gold" aria-hidden /> : null}
                  {working ? "Working on it…" : "You approve every payment."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <PermissionChip level={permissionLevel} className="hidden sm:inline-flex" />
              {lastAssistant?.mode ? <span className="hidden text-[12.5px] text-muted sm:inline">{lastAssistant.mode === "llm" ? `Claude · ${lastAssistant.model}` : "Built-in planner"}</span> : null}
              {!empty && (
                <button
                  onClick={() => {
                    setMessages([]);
                    setInstructionStatus({});
                  }}
                  disabled={busy}
                  aria-label="New chat"
                  className="cm-press inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[14px] px-3 text-[14px] font-bold text-cocoa-2 hover:bg-cream disabled:opacity-40"
                >
                  <RotateCcw className="size-4" /> <span className="hidden sm:inline">New chat</span>
                </button>
              )}
            </div>
          </div>
          {!empty && (
            <AgentProgress states={phases} className="mt-3.5" />
          )}
        </div>
      </div>

      <div className="flex-1 space-y-8 py-6">
        {empty && (
          <div className="pt-6 text-center sm:pt-12">
            <MascotTile size={84} className="mx-auto" />
            <h2 className="mt-6 font-display text-[30px] font-extrabold leading-tight tracking-[-0.05em] text-cocoa sm:text-[36px]">Hi {firstName}, what can I sort out?</h2>
            <p className="mx-auto mt-2 max-w-[46ch] text-[15.5px] leading-6 text-muted">
              I check your accounts and the transfer rules, compare providers, and get payments ready. You approve every payment before money moves.
            </p>
            <div className="mx-auto mt-8 grid max-w-[640px] gap-3 text-left sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button key={s.title} onClick={() => send(s.prompt)} className="cm-lift cm-press flex items-start gap-3 rounded-[22px] bg-white p-4 text-left shadow-card">
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px]", s.tone)}>
                    <s.Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-[15.5px] font-extrabold text-cocoa">{s.title}</span>
                    <span className="block text-[13.5px] leading-5 text-muted">{s.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] animate-rise rounded-[20px] rounded-tr-[6px] bg-cocoa px-4 py-3 text-[15.5px] font-bold text-white">{m.text}</div>
            </div>
          ) : (
            <AssistantMessage
              key={m.id}
              m={m}
              isLast={m.id === lastAssistant?.id}
              busy={busy}
              instructionStatus={instructionStatus}
              onSuggestion={(s) => send(s)}
              onReview={(c) => setConfirm({ target: c, correlationId: m.correlationId, msgId: m.id })}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>

      {/* Floating composer. Sits above the bottom nav on mobile. */}
      <div className="sticky bottom-[76px] z-20 -mx-1 bg-gradient-to-t from-ivory from-60% to-transparent px-1 pb-2 pt-6 lg:bottom-0 lg:pb-6">
        {/* On phones, once a conversation starts, the prompts move into the + menu to save space. */}
        <div className={cn("cm-scroll-x mb-2.5 gap-2 overflow-x-auto px-1", empty ? "flex" : "hidden sm:flex")}>
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={busy}
              className="cm-press min-h-10 shrink-0 rounded-full bg-gold-soft px-4 text-[14px] font-extrabold text-gold-ink hover:bg-peach disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="relative">
          {menu && (
            <div className="absolute bottom-full left-0 mb-2 w-64 animate-rise rounded-[20px] bg-white p-2 shadow-float" role="menu">
              {MORE_ACTIONS.map((a) => (
                <button key={a} role="menuitem" onClick={() => send(a)} disabled={busy} className="flex min-h-11 w-full items-center rounded-[14px] px-3 text-left text-[14.5px] font-semibold text-cocoa hover:bg-cream">
                  {a}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-[22px] bg-white p-2 shadow-float ring-1 ring-line transition-shadow focus-within:ring-2 focus-within:ring-gold"
          >
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-label="More actions"
              className="cm-press flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-cream text-cocoa-2 hover:bg-sand"
            >
              <Plus className={cn("size-5 transition-transform duration-200", menu && "rotate-45")} />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask CaiMao about your money…"
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[16px] text-cocoa outline-none placeholder:text-muted [&::placeholder]:overflow-hidden [&::placeholder]:text-ellipsis [&::placeholder]:whitespace-nowrap"
              aria-label="Message CaiMao"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="cm-press cm-cta flex size-11 shrink-0 items-center justify-center rounded-[15px] transition-opacity disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" strokeWidth={2.4} />}
            </button>
          </form>
        </div>
      </div>

      <ConfirmTransferDialog
        target={confirm?.target ?? null}
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        correlationId={confirm?.correlationId}
        onCompleted={onCompleted}
        onDeclined={onDeclined}
      />
    </div>
  );
}

function AssistantMessage({
  m,
  isLast,
  busy,
  instructionStatus,
  onSuggestion,
  onReview,
}: {
  m: AssistantMsg;
  isLast: boolean;
  busy: boolean;
  instructionStatus: Record<string, Status>;
  onSuggestion: (s: string) => void;
  onReview: (c: ConfirmTarget) => void;
}) {
  // Analysis steps are gathered into one quiet summary at the top; execution steps stay where they happened.
  const steps = m.blocks.filter((b): b is Extract<Block, { kind: "steps" }> => b.kind === "steps" && !b.inline).flatMap((b) => b.steps);
  const raw = m.blocks.filter((b) => !(b.kind === "steps" && !b.inline));
  const cardOf = <K extends AgentCard["kind"]>(k: K) =>
    raw.find((b): b is Extract<Block, { kind: "card" }> => b.kind === "card" && b.card.kind === k)?.card as Extract<AgentCard, { kind: K }> | undefined;
  // Invoice, funds and requirements read as one summary card, the way CaiMao checks them.
  const obl = cardOf("obligations");
  const snapshot = { obligation: obl && obl.focus_id ? obl : undefined, funds: cardOf("funds"), compliance: cardOf("compliance") };
  const grouped = [snapshot.obligation, snapshot.funds, snapshot.compliance].filter(Boolean).length >= 2;
  const groupedKinds = new Set(["obligations", "funds", "compliance"]);
  let placed = false;
  const body: RenderBlock[] = raw.flatMap((b): RenderBlock[] => {
    if (b.kind !== "card") return [b];
    if (b.card.kind === "accounts" && snapshot.funds) return [];
    if (grouped && groupedKinds.has(b.card.kind) && !(b.card.kind === "obligations" && !b.card.focus_id)) {
      if (placed) return [];
      placed = true;
      return [{ kind: "snapshot", key: b.key }];
    }
    return [b];
  });
  const prepare = isLast && m.done ? m.suggestions.find((s) => s.startsWith("Prepare the payment")) : undefined;
  return (
    <div className="flex gap-3">
      <MascotTile size={34} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-4">
        {steps.length > 0 || !m.done ? <Activity steps={steps} running={!m.done} /> : null}
        {body.map((b, i) =>
          b.kind === "snapshot" ? (
            <div key={b.key} className="animate-rise">
              <PaymentSnapshot {...snapshot} />
            </div>
          ) : b.kind === "steps" ? (
            <Activity key={i} steps={b.steps} running={false} />
          ) : b.kind === "card" ? (
            <div key={b.key} className="animate-rise">
              <AgentCardView
                onPrepare={b.card.kind === "quotes" && prepare && !busy ? () => onSuggestion(prepare) : undefined}
                card={b.card}
                instructionStatus={b.card.kind === "instruction" ? instructionStatus[b.card.request.id] : undefined}
                onReview={
                  b.card.kind === "instruction"
                    ? () => {
                        const c = b.card as Extract<AgentCard, { kind: "instruction" }>;
                        onReview({ request: c.request, provider_name: c.provider_name, account_label: c.account_label, obligation_title: c.obligation_title });
                      }
                    : undefined
                }
              />
            </div>
          ) : b.kind === "text" ? (
            <div key={i} className="max-w-[68ch] animate-rise">
              <Markdown text={b.text} />
            </div>
          ) : (
            <div key={i} className={cn("rounded-[18px] px-4 py-3 text-[14px]", b.tone === "error" ? "bg-warning-soft text-warning-ink" : "bg-white text-muted")}>
              {b.text}
            </div>
          ),
        )}
        {m.done && m.suggestions.length > 0 && isLast && (
          <div className="flex flex-wrap gap-2 pt-1">
            {m.suggestions.filter((s) => s !== prepare).map((s) => (
              <button key={s} onClick={() => onSuggestion(s)} disabled={busy} className="cm-press min-h-11 rounded-full bg-brand-soft px-4 text-[14.5px] font-extrabold text-brand hover:bg-peach-soft disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What CaiMao checked, in plain words. The technical tool calls, permission
 * levels and results are one tap away for anyone who wants to inspect them.
 */
function Activity({ steps, running }: { steps: Step[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  const current = steps.find((s) => s.status === "running");
  const quotes = steps.find((s) => s.tool === "getRemittanceQuotes" && s.status === "ok");
  const providerCount = quotes?.summary?.match(/(\d+) providers/)?.[1];
  const summary = steps
    .filter((s) => s.status !== "running" && FRIENDLY[s.tool]?.summary && !(s.tool === "calculateTransferCost" && quotes))
    .map((s) => ({
      id: s.id,
      ok: s.status === "ok",
      text: s.status === "error" ? s.summary ?? "Something went wrong" : s.tool === "getRemittanceQuotes" && providerCount ? `Compared ${providerCount} providers` : FRIENDLY[s.tool]?.done ?? s.label,
    }));

  return (
    <div className="rounded-[20px] bg-white px-4 py-3.5 shadow-card">
      {running && (
        <div className="flex items-center gap-2 text-[14.5px] font-bold text-cocoa" aria-live="polite">
          <span className="size-2 animate-pulse-soft rounded-full bg-gold" aria-hidden />
          {current ? `${FRIENDLY[current.tool]?.running ?? current.label.replace(/…$/, "")}…` : "Thinking…"}
        </div>
      )}
      {summary.length > 0 && (
        <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", running && "mt-2")}>
          {summary.map((s) => (
            <li key={s.id} className={cn("flex items-center gap-1.5 text-[14px] font-semibold", s.ok ? "text-cocoa-2" : "text-error-ink")}>
              {s.ok ? <Check className="size-4 text-success-ink" strokeWidth={3} aria-label="done" /> : <CircleX className="size-4" aria-label="failed" />}
              {s.text}
            </li>
          ))}
        </ul>
      )}
      {steps.length > 0 && (
        <>
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1.5 inline-flex min-h-10 items-center gap-1 text-[13.5px] font-bold text-brand hover:underline">
            <ShieldCheck className="size-4" />
            {open ? "Hide details" : `See what CaiMao checked (${steps.length})`}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <ol className="mt-2 animate-rise space-y-1.5 border-t border-line pt-3">
              {steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3 rounded-[14px] bg-cream px-3 py-2">
                  <span className="mt-0.5">
                    {s.status === "running" ? <Loader2 className="size-4 animate-spin text-brand" /> : s.status === "ok" ? <Check className="size-4 text-success-ink" strokeWidth={3} /> : <CircleX className="size-4 text-error-ink" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <code className="font-mono text-[12.5px] font-medium text-cocoa">{s.tool.startsWith("USER_") ? s.tool : `${s.tool}()`}</code>
                    {s.summary ? <div className={cn("text-[13px]", s.status === "error" ? "text-error-ink" : "text-muted")}>{s.summary}</div> : null}
                  </div>
                  <PermissionChip level={s.level} compact />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
