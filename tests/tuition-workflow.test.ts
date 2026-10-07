import { describe, expect, it } from "vitest";
import { agentCtx, ask, freshRepo, sgdBalance, tuition, userCtx } from "./helpers";
import { approveTransfer, createTransferInstruction, declineTransfer, DomainError, executeSandboxTransfer, getFxService } from "@/lib/finance";
import { compareQuotes, quoteForSourceAmount } from "@/lib/remittance/engine";
import { buildProviders } from "@/lib/seed";
import { llmToolSpecs } from "@/lib/agent/tools";
import type { RemittanceProvider } from "@/lib/types";

const expectDomainError = async (p: Promise<unknown>, code: DomainError["code"]) => {
  await expect(p).rejects.toBeInstanceOf(DomainError);
  await expect(p).rejects.toMatchObject({ code });
};

describe("Test 1 — sufficient funds and a valid route: payment succeeds after approval", () => {
  it("runs the agent workflow end to end and executes only after the user confirms", async () => {
    const repo = freshRepo();

    const analysis = await ask(repo, "Pay my tuition");
    expect(analysis.tools.every((t) => t.ok)).toBe(true);
    expect(analysis.tools.map((t) => t.tool)).toEqual([
      "getUserProfile",
      "getObligations",
      "getAccounts",
      "getFXRate",
      "getTransferRules",
      "getRemittanceQuotes",
      "calculateTransferCost",
    ]);
    expect(analysis.cards.find((c) => c.kind === "compliance")).toMatchObject({ result: { status: "COMPLIANT" } });
    expect(await repo.listTransferRequests()).toHaveLength(0); // recommending prepares nothing

    const prep = await ask(repo, "Prepare the payment with Panda Remit Demo");
    const instruction = prep.cards.find((c) => c.kind === "instruction");
    expect(instruction).toBeDefined();
    if (instruction?.kind !== "instruction") throw new Error("no instruction");
    expect(instruction.request.status).toBe("PENDING_APPROVAL");
    expect(instruction.request.destination_amount).toBeGreaterThanOrEqual(15000);
    expect(await sgdBalance(repo)).toBe(32000); // nothing moved yet

    await approveTransfer(userCtx(repo), { transfer_request_id: instruction.request.id, acknowledged: true });
    const out = await executeSandboxTransfer(agentCtx(repo), instruction.request.id);
    expect(out.status).toBe("COMPLETED");
    expect(out.transaction_id).toMatch(/^UF-\d{4}-\d{6}$/);
    expect(out.destination_amount).toBe(15000);

    const actions = (await repo.listAudit()).map((a) => a.action);
    for (const a of ["TRANSFER_RULE_CHECK", "QUOTE_RETRIEVAL", "TRANSFER_PREPARED", "USER_APPROVAL", "TRANSFER_EXECUTED", "BALANCE_UPDATED", "OBLIGATION_PAID"]) {
      expect(actions).toContain(a);
    }
  });
});

describe("Test 2 — insufficient funds: the AI does not prepare execution", () => {
  it("stops after the funds check and creates no transfer request", async () => {
    const repo = freshRepo("insufficient_funds");
    const r = await ask(repo, "Pay my tuition");
    expect(r.cards.find((c) => c.kind === "funds")).toMatchObject({ sufficient: false });
    expect(r.tools.map((t) => t.tool)).not.toContain("createTransferInstruction");
    expect(r.tools.map((t) => t.tool)).not.toContain("getTransferRules");
    expect(await repo.listTransferRequests()).toHaveLength(0);
  });

  it("the server refuses to prepare it even if asked directly", async () => {
    const repo = freshRepo("insufficient_funds");
    const ob = await tuition(repo);
    await expectDomainError(createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" }), "INSUFFICIENT_FUNDS");
    expect(await repo.listTransferRequests()).toHaveLength(0);
    expect((await repo.listAudit()).some((a) => a.action === "TRANSFER_REJECTED")).toBe(true);
  });
});

describe("Test 3 — a transfer that violates a rule is blocked", () => {
  it("the agent reports the block from the regulatory database and prepares nothing", async () => {
    const repo = freshRepo("over_limit");
    const r = await ask(repo, "Pay my tuition");
    const compliance = r.cards.find((c) => c.kind === "compliance");
    expect(compliance).toMatchObject({ result: { status: "BLOCKED" } });
    if (compliance?.kind === "compliance") {
      expect(compliance.result.evaluations.find((e) => e.outcome === "BLOCK")?.rule.id).toBe("rule-sg-limit");
    }
    expect(r.cards.some((c) => c.kind === "blocked")).toBe(true);
    expect(r.tools.map((t) => t.tool)).not.toContain("createTransferInstruction");
    expect(await repo.listTransferRequests()).toHaveLength(0);
  });

  it("the server blocks a direct prepare call", async () => {
    const repo = freshRepo("over_limit");
    const ob = await tuition(repo);
    await expectDomainError(createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-home-bank" }), "COMPLIANCE_BLOCKED");
  });

  it("missing documents give ACTION_REQUIRED and nothing is prepared", async () => {
    const repo = freshRepo();
    const p = await repo.getProfile();
    await repo.updateProfile({ documents_on_file: p.documents_on_file.filter((d) => d !== "Source-of-funds declaration") });
    const ob = await tuition(repo);
    await expectDomainError(createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" }), "COMPLIANCE_ACTION_REQUIRED");
  });
});

describe("Test 4 — user does not approve: no payment occurs", () => {
  it("execution without approval is refused and balances do not change", async () => {
    const repo = freshRepo();
    const ob = await tuition(repo);
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await expectDomainError(executeSandboxTransfer(agentCtx(repo), tr.id), "APPROVAL_REQUIRED");
    expect(await sgdBalance(repo)).toBe(32000);
    expect((await tuition(repo)).status).toBe("PAYMENT_DUE");
    expect(await repo.listExecutions()).toHaveLength(0);
  });

  it("approval without the review acknowledgement is refused", async () => {
    const repo = freshRepo();
    const ob = await tuition(repo);
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await expectDomainError(approveTransfer(userCtx(repo), { transfer_request_id: tr.id, acknowledged: false }), "APPROVAL_REQUIRED");
  });

  it("the agent cannot approve on the user's behalf", async () => {
    const repo = freshRepo();
    const ob = await tuition(repo);
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await expectDomainError(approveTransfer(agentCtx(repo), { transfer_request_id: tr.id, acknowledged: true }), "APPROVAL_REQUIRED");
  });

  it("a declined transfer can never be executed", async () => {
    const repo = freshRepo();
    const ob = await tuition(repo);
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await declineTransfer(userCtx(repo), tr.id);
    await expectDomainError(approveTransfer(userCtx(repo), { transfer_request_id: tr.id, acknowledged: true }), "INVALID_STATE");
    await expectDomainError(executeSandboxTransfer(agentCtx(repo), tr.id), "APPROVAL_REQUIRED");
    expect(await sgdBalance(repo)).toBe(32000);
    expect((await repo.listAudit()).some((a) => a.action === "USER_DECLINED")).toBe(true);
  });

  it("execution tools are never offered to the model", () => {
    const names = llmToolSpecs().map((t) => t.name);
    for (const forbidden of ["executeSandboxTransfer", "updateAccountBalance", "markObligationPaid", "approveTransfer"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("Test 5 — different FX spreads: highest recipient amount wins, not lowest fee", () => {
  it("picks the provider that delivers more even when another advertises no fee", async () => {
    const repo = freshRepo();
    const fx = await getFxService(repo);
    const base = buildProviders()[0];
    const zeroFeeWideSpread: RemittanceProvider = { ...base, id: "a", name: "Zero-fee Bank", fixed_fee: 0, fx_margin: 0.02 };
    const feeTightSpread: RemittanceProvider = { ...base, id: "b", name: "Low-spread Provider", fixed_fee: 20, fx_margin: 0.003 };
    const input = { source_currency: "SGD" as const, destination_currency: "GBP" as const, source_amount: 10000 };
    const cmp = compareQuotes([quoteForSourceAmount(zeroFeeWideSpread, input, fx), quoteForSourceAmount(feeTightSpread, input, fx)]);
    expect(cmp.lowest_advertised_fee?.provider_id).toBe("a");
    expect(cmp.best?.provider_id).toBe("b");
    expect(cmp.best!.estimated_recipient_amount).toBeGreaterThan(cmp.quotes[1].estimated_recipient_amount);
    expect(cmp.best!.total_cost).toBeLessThan(cmp.quotes[1].total_cost);
  });

  it("with the seeded providers, the fee-free Home Bank is not recommended", async () => {
    const repo = freshRepo();
    const r = await ask(repo, "Compare FX rates");
    const quotes = r.cards.find((c) => c.kind === "quotes");
    if (quotes?.kind !== "quotes") throw new Error("no quotes");
    expect(quotes.lowest_fee_provider_id).toBe("prov-home-bank");
    expect(quotes.best_provider_id).not.toBe("prov-home-bank");
    const best = quotes.quotes.find((q) => q.provider_id === quotes.best_provider_id)!;
    expect(Math.max(...quotes.quotes.map((q) => q.estimated_recipient_amount))).toBe(best.estimated_recipient_amount);
  });

  it("total cost = fee + FX spread cost + other charges", async () => {
    const repo = freshRepo();
    const fx = await getFxService(repo);
    for (const p of buildProviders()) {
      const q = quoteForSourceAmount(p, { source_currency: "SGD", destination_currency: "GBP", source_amount: 26000 }, fx);
      expect(q.total_cost).toBeCloseTo(q.transfer_fee + q.fx_spread_cost + q.other_charges, 2);
      expect(q.total_cost_destination).toBeCloseTo(26000 * q.market_fx_rate - q.estimated_recipient_amount, 1);
    }
  });
});

describe("Test 6 — payment completes: balance decreases and obligation is PAID", () => {
  it("debits exactly the sent amount, marks the invoice paid and records the ledger entry", async () => {
    const repo = freshRepo();
    const ob = await tuition(repo);
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await approveTransfer(userCtx(repo), { transfer_request_id: tr.id, acknowledged: true });
    const out = await executeSandboxTransfer(agentCtx(repo), tr.id);

    expect(await sgdBalance(repo)).toBeCloseTo(32000 - tr.source_amount, 2);
    expect(out.new_balance).toBeCloseTo(32000 - tr.source_amount, 2);
    const paid = await tuition(repo);
    expect(paid.status).toBe("PAID");
    expect(paid.payment_execution_id).toBeTruthy();
    expect((await repo.getTransferRequest(tr.id))?.status).toBe("COMPLETED");
    const ledger = (await repo.listTransactions()).find((t) => t.description.includes("TUITION-2026-001"));
    expect(ledger?.amount).toBeCloseTo(-tr.source_amount, 2);
  });

  it("an approved transfer cannot be executed twice", async () => {
    const repo = freshRepo();
    const ob = await tuition(repo);
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await approveTransfer(userCtx(repo), { transfer_request_id: tr.id, acknowledged: true });
    await executeSandboxTransfer(agentCtx(repo), tr.id);
    const after = await sgdBalance(repo);
    await expectDomainError(executeSandboxTransfer(agentCtx(repo), tr.id), "APPROVAL_REQUIRED");
    expect(await sgdBalance(repo)).toBe(after);
    expect(await repo.listExecutions()).toHaveLength(1);
  });
});

describe("Permission model", () => {
  it("Level 1 lets the agent read but not prepare", async () => {
    const repo = freshRepo();
    await repo.updateProfile({ ai_permission_level: 1 });
    const r = await ask(repo, "Prepare the payment");
    const prep = r.tools.find((t) => t.tool === "createTransferInstruction");
    expect(prep?.ok).toBe(false);
    expect(await repo.listTransferRequests()).toHaveLength(0);
    expect((await repo.listAudit()).some((a) => a.action === "PERMISSION_DENIED")).toBe(true);
  });

  it("an expired quote cannot be approved", async () => {
    const repo = freshRepo();
    const ob = await tuition(repo);
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await repo.transitionTransferRequest(tr.id, ["PENDING_APPROVAL"], { expires_at: new Date(Date.now() - 1000).toISOString() });
    await expectDomainError(approveTransfer(userCtx(repo), { transfer_request_id: tr.id, acknowledged: true }), "EXPIRED");
  });
});
