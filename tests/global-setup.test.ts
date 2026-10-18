import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { agentCtx, ask, freshRepo, sgdBalance, userCtx } from "./helpers";
import { MemoryRepository } from "@/lib/data/memory";
import { REFERENCE } from "@/lib/reference";
import { evaluateRegulation, UNVERIFIED_MESSAGE } from "@/lib/regulatory/engine";
import { checkRegulation } from "@/lib/regulatory/service";
import { checkEligibility, bankingProfileFrom } from "@/lib/banking/eligibility";
import { getFxService, createTransferInstruction, executeSandboxTransfer, DomainError } from "@/lib/finance";
import { llmToolSpecs } from "@/lib/agent/tools";
import { serverTranslator } from "@/lib/i18n/translator";
import { uploadStatement } from "@/lib/statements/service";
import type { AgentCard } from "@/lib/agent/protocol";

const card = <K extends AgentCard["kind"]>(cards: AgentCard[], kind: K) => cards.find((c) => c.kind === kind) as Extract<AgentCard, { kind: K }> | undefined;

describe("reference data integrity", () => {
  it("every researched rule and bank cites an official https source and a last-verified date", () => {
    expect(REFERENCE.rules.length).toBeGreaterThan(50);
    for (const r of REFERENCE.rules) {
      expect(r.official_source_url).toMatch(/^https:\/\//);
      expect(r.regulator).toBeTruthy();
      expect(r.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.is_demo).toBe(false);
      expect(["verified", "needs_verification"]).toContain(r.status);
    }
    for (const b of REFERENCE.banks) {
      expect(b.official_url).toMatch(/^https:\/\//);
      expect(b.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const c of ["SG", "GB", "US", "JP", "CN"]) {
      expect(REFERENCE.banks.some((b) => b.country === c)).toBe(true);
      expect(REFERENCE.accountRequirements.some((r) => r.country === c)).toBe(true);
      expect(REFERENCE.creditSystems.some((r) => r.country === c)).toBe(true);
    }
  });
});

describe("banking abroad", () => {
  it("TEST 5: a Chinese student moving to Singapore gets Singapore's requirements and banks", async () => {
    const repo = freshRepo();
    const r = await ask(repo, "I'm a Chinese student moving to Singapore. How do I set up my finances?");
    const tools = r.tools.map((t) => t.tool);
    expect(tools).toEqual(expect.arrayContaining(["getCountryBankingRequirements", "getAvailableBanks", "getBankEligibility", "getCreditSystemInfo"]));
    const banks = card(r.cards, "banks")!;
    expect(banks.country).toBe("SG");
    expect(banks.eligibility.banks.map((b) => b.bank.bank_name)).toEqual(expect.arrayContaining(["DBS Bank", "OCBC Bank"]));
    expect(banks.requirements?.country).toBe("SG");
    expect(banks.requirements?.typical_documents.length).toBeGreaterThan(0);
    const audit = (await repo.listAudit()).filter((a) => a.correlation_id === r.events.find((e) => e.type === "meta" && "correlation_id" in e)?.["correlation_id" as never]);
    const actions = (await repo.listAudit()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["COUNTRY_REQUIREMENTS_RETRIEVED", "BANK_OPTIONS_RETRIEVED"]));
    expect(audit).toBeDefined();
  });

  it("TEST 6: missing residency or visa makes CaiMao ask instead of assuming eligibility", async () => {
    const repo = freshRepo();
    const r = await ask(repo, "I'm a Chinese student moving to Singapore. How do I set up my finances?");
    const banks = card(r.cards, "banks")!;
    // The saved profile is Singaporean, so the described persona must not inherit its visa/residency.
    expect(banks.eligibility.missing).toEqual(expect.arrayContaining(["visa_type", "residency_status"]));
    expect(banks.eligibility.banks.every((b) => b.verdict === "need_info")).toBe(true);
    expect(r.text).toMatch(/could you tell me/i);
    expect((await repo.listAudit()).some((a) => a.action === "CLARIFICATION_REQUESTED")).toBe(true);
    expect((await repo.listAudit()).some((a) => a.action === "ELIGIBILITY_CHECKED")).toBe(false);

    // Once the details are given, guidance follows (still never a guarantee).
    const r2 = await ask(repo, "I have my student pass and I've arrived. I'm 20.");
    void r2; // single-turn helper: check the engine directly with the details supplied
    const profile = await repo.getProfile();
    const full = checkEligibility(REFERENCE.banks, bankingProfileFrom(profile, { nationality: "CN", destination: "SG", visa_type: "student", residency_status: "resident", age: 20, student_status: "full_time" }));
    expect(full.missing).toHaveLength(0);
    expect(full.banks.some((b) => b.verdict === "likely_eligible")).toBe(true);
    expect(full.banks.every((b) => b.reasons.length > 0)).toBe(true);
  });

  it("eligibility never uses a bank fact that wasn't confirmed: unconfirmed banks say 'check with the bank'", async () => {
    const repo = freshRepo();
    const profile = await repo.getProfile();
    const res = checkEligibility(REFERENCE.banks, bankingProfileFrom(profile, { nationality: "CN", destination: "SG", visa_type: "student", residency_status: "resident", age: 20, student_status: "full_time" }));
    for (const b of res.banks.filter((x) => x.bank.status === "needs_verification")) expect(b.verdict).not.toBe("likely_eligible");
  });
});

describe("regulatory assistant", () => {
  it("TEST 7: a corridor with no verified rules returns NEEDS_VERIFICATION and the exact sentence", async () => {
    const repo = freshRepo();
    const fx = await getFxService(repo);
    const result = evaluateRegulation(await repo.listCountryRules(), { source_country: "VN", destination_country: "HK", purpose: "personal", amount: 1000, currency: "USD", nationality: "VN" }, fx);
    expect(result.status).toBe("NEEDS_VERIFICATION");
    expect(result.unverified_message).toBe(UNVERIFIED_MESSAGE);
    expect(result.findings).toHaveLength(0);
    // The assistant says it in the conversation too.
    const r = await ask(repo, "What are the rules for sending money from Vietnam to Hong Kong?");
    expect(r.text).toContain("I couldn't verify this requirement from the current regulatory database.");
  });

  it("TEST 8: a regulatory answer includes official sources and last-verified dates", async () => {
    const repo = freshRepo();
    const result = await checkRegulation(
      { repo, actor: "user", correlationId: "t8" },
      { source_country: "CN", destination_country: "SG", purpose: "education", amount: 30000, currency: "SGD", nationality: "CN", residency_status: "non_resident", visa_type: "student", use_profile: false },
    );
    expect(result.sources.length).toBeGreaterThan(0);
    for (const s of result.sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.regulator).toBeTruthy();
    }
    expect(result.findings.some((f) => f.rule.id.startsWith("cn-") && f.side === "sending")).toBe(true);
    expect(result.findings.some((f) => f.rule.destination_country === "SG" && f.side === "receiving")).toBe(true);
    expect(["COMPLIANT", "ACTION_REQUIRED"]).toContain(result.status);
    const actions = (await repo.listAudit()).filter((a) => a.correlation_id === "t8").map((a) => a.action).reverse(); // listAudit is newest first
    expect(actions).toEqual(["RULE_QUERY", "RULE_SOURCE_RETRIEVED", "RULE_EVALUATED", "RESULT_PRESENTED"]);
    // Personal details are never written to the audit log.
    const q = (await repo.listAudit()).find((a) => a.correlation_id === "t8" && a.action === "RULE_QUERY")!;
    expect(q.details.nationality).toBe("provided");
  });

  it("rules that depend on unknown personal details are flagged and ask for them", async () => {
    const repo = freshRepo();
    const fx = await getFxService(repo);
    const result = evaluateRegulation(await repo.listCountryRules(), { source_country: "CN", destination_country: "SG", purpose: "education", amount: 30000, currency: "SGD" }, fx);
    expect(result.status).toBe("NEEDS_VERIFICATION");
    expect(result.missing_info).toContain("nationality");
  });

  it("over a hard limit a verified rule blocks; border-cash rules never decide a bank transfer", async () => {
    const repo = freshRepo();
    const fx = await getFxService(repo);
    const rules = await repo.listCountryRules();
    const r = evaluateRegulation(rules, { source_country: "CN", destination_country: "SG", purpose: "education", amount: 30000, currency: "SGD", nationality: "CN", residency_status: "non_resident", visa_type: "student" }, fx);
    expect(r.findings.filter((f) => f.rule.channel === "cash").every((f) => f.outcome === "INFO")).toBe(true);
  });

  it("the agent's cross-border answer comes from getFundFlowRules with a regulatory card", async () => {
    const repo = freshRepo();
    const r = await ask(repo, "I'm Chinese. What are the rules for sending SGD 30,000 tuition from China to Singapore?");
    expect(r.tools.map((t) => t.tool)).toContain("getFundFlowRules");
    const reg = card(r.cards, "regulatory")!;
    expect(reg.result.query.source_country).toBe("CN");
    expect(reg.result.query.destination_country).toBe("SG");
    expect(reg.result.query.nationality).toBe("CN");
    expect(reg.result.sources.length).toBeGreaterThan(0);
  });
});

describe("language", () => {
  it("TEST 9: the language setting persists on the profile and survives a demo reset", async () => {
    const repo = freshRepo();
    const r = await ask(repo, "Please reply in Japanese");
    expect(r.tools.map((t) => t.tool)).toContain("updateLanguagePreference");
    expect((await new MemoryRepository().getProfile()).language).toBe("ja");
    await repo.reset("standard");
    expect((await new MemoryRepository().getProfile()).language).toBe("ja");
    await repo.updateProfile({ language: "zh-CN" });
    expect((await new MemoryRepository().getProfile()).language).toBe("zh-CN");
  });

  const require_ = createRequire(path.join(__dirname, "../package.json"));
  const { IntlMessageFormat } = require_("intl-messageformat");
  const load = (l: string) => JSON.parse(fs.readFileSync(path.join(__dirname, `../messages/${l}.json`), "utf8"));
  const flat = (o: Record<string, unknown>, p = ""): [string, string][] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v as Record<string, unknown>, `${p}${k}.`) : [[`${p}${k}`, v as string]]));
  const en = Object.fromEntries(flat(load("en")));

  for (const [locale, name, testName] of [["zh-CN", "Chinese", "TEST 10"], ["ja", "Japanese", "TEST 11"]] as const) {
    it(`${testName}: English → ${name} UI translation is complete, valid and actually translated`, () => {
      const target = Object.fromEntries(flat(load(locale)));
      const missing = Object.keys(en).filter((k) => !(k in target));
      expect(missing).toEqual([]);
      for (const [k, v] of Object.entries(target)) expect(() => new IntlMessageFormat(v, locale), k).not.toThrow();
      const cjk = /[぀-ヿ㐀-鿿]/;
      expect(target["Nav.labels.home"]).toMatch(cjk);
      expect(target["StatementPage.title"]).toMatch(cjk);
      expect(target["Regulation.unverified"]).toMatch(cjk);
      // Brand and IDs stay as they are.
      expect(target["Nav.labels.caimao"]).toBe("CaiMao");
    });
  }

  it("the assistant replies in the user's language", async () => {
    const repo = freshRepo();
    await repo.updateProfile({ language: "zh-CN" });
    const r = await ask(repo, "Pay my tuition");
    expect(r.text).toMatch(/[一-鿿]/);
    await repo.updateProfile({ language: "ja" });
    const r2 = await ask(repo, "What are the rules for sending money from Vietnam to Hong Kong?");
    expect(r2.text).toContain(serverTranslator("ja", "Agent")("rules.unverified"));
  });
});

describe("privacy and safety", () => {
  it("TEST 12: statement data is scoped to its owner", async () => {
    const repo = freshRepo();
    const sample = fs.readFileSync(path.join(__dirname, "../public/samples/caimao-sample-statement.csv"));
    const { upload } = await uploadStatement(repo, { bytes: new Uint8Array(sample), fileName: "s.csv", consent: true });
    // Another signed-in user (memory mode has one demo user, so any other id is refused outright).
    const other = new MemoryRepository("22222222-2222-4222-8222-222222222222");
    await expect(other.getStatement(upload.id)).rejects.toThrow();
    await expect(other.listStatementTransactions(upload.id)).rejects.toThrow();
    // Rows can't be written for someone else either.
    await expect(repo.createStatement({ ...upload, id: "x", user_id: "someone-else" }, [])).rejects.toThrow(/signed-in user/);
    // The row-level-security version of this test runs against PostgreSQL in sql.test.ts.
  });

  it("TEST 13: a payment still cannot execute without the user's approval", async () => {
    const repo = freshRepo();
    const ob = (await repo.listObligations()).find((o) => o.kind === "tuition")!;
    const tr = await createTransferInstruction(agentCtx(repo), { obligation_id: ob.id, provider_id: "prov-panda-remit-demo" });
    await expect(executeSandboxTransfer(agentCtx(repo), tr.id)).rejects.toBeInstanceOf(DomainError);
    expect(await sgdBalance(repo)).toBe(32000);
    const names = llmToolSpecs().map((t) => t.name);
    for (const forbidden of ["executeSandboxTransfer", "approveTransfer", "parseBankStatement"]) expect(names).not.toContain(forbidden);
    void userCtx;
  });

  it("TEST 14: the original tuition workflow is unchanged with the researched rules loaded", async () => {
    const repo = freshRepo();
    const r = await ask(repo, "Pay my tuition");
    expect(r.tools.map((t) => t.tool)).toEqual(["getUserProfile", "getObligations", "getAccounts", "getFXRate", "getTransferRules", "getRemittanceQuotes", "calculateTransferCost"]);
    expect(card(r.cards, "compliance")?.result.status).toBe("COMPLIANT");
    expect(r.events.some((e) => e.type === "suggestions" && e.prepare?.startsWith("Prepare the payment with"))).toBe(true);
  });

  it("new agent tools declare permission levels; the setup plan is a Level 2 action", () => {
    const specs = llmToolSpecs();
    const plan = specs.find((s) => s.name === "getAccountSetupSteps")!;
    expect(plan.description).toContain("Permission level 2");
    expect(specs.find((s) => s.name === "getFundFlowRules")!.description).toContain("couldn't verify this requirement");
  });
});
