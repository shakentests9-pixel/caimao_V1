import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { detectIntent, extractFacts } from "@/lib/agent/scripted";

/**
 * The built-in planner must understand the suggestion chips it shows, in every UI language:
 * each translated chip has to route to the same tool workflow as the English one.
 */
const load = (l: string) => JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8"));
const en = load("en");
const fill = (l: string, s: string) => {
  const c = load(l).Countries;
  return s.replace(/\{country\}|\{to\}/g, c.SG).replace("{from}", c.CN).replace("{currency}", "CNY").replace("{provider}", "Wise");
};

describe("assistant understands chips in every language", () => {
  for (const l of ["zh-CN", "ja"]) {
    const m = load(l);
    for (const ns of ["Copilot.prompts", "Agent.suggest"]) {
      const [a, b] = ns.split(".");
      for (const [k, v] of Object.entries(en[a][b] as Record<string, string>)) {
        it(`${l} ${ns}.${k}`, () => {
          expect(detectIntent(fill(l, m[a][b][k]))).toBe(detectIntent(fill("en", v)));
        });
      }
    }
  }
});

describe("free-form requests in Chinese and Japanese", () => {
  it.each([
    ["我是中国学生，要去新加坡留学，帮我做财务准备", "setup", { nationality: "CN", destination: "SG" }],
    ["中国人の学生でシンガポールに留学します。お金の準備を手伝って", "setup", { nationality: "CN", destination: "SG" }],
    ["我想在新加坡开银行账户", "setup", { destination: "SG" }],
    ["シンガポールで銀行口座を開きたい", "setup", { destination: "SG" }],
    ["从中国汇学费到新加坡有什么规定", "fund_flow", { source: "CN", destination: "SG" }],
    ["中国からシンガポールへ学費を送るルール", "fund_flow", { source: "CN", destination: "SG" }],
  ])("%s", (text, intent, facts) => {
    expect(detectIntent(text)).toBe(intent);
    expect(extractFacts([text])).toMatchObject(facts);
  });
});
