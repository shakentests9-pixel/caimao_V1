import { describe, expect, it, vi } from "vitest";

/**
 * On serverless hosts the proxy and the route handlers run in different processes.
 * A demo sign-in must verify in a process other than the one that signed it, even when
 * DEMO_SESSION_SECRET isn't configured (e.g. a Vercel preview without that variable).
 */
describe("demo session across processes", () => {
  it("a cookie signed in one process verifies in another without DEMO_SESSION_SECRET", async () => {
    const saved = process.env.DEMO_SESSION_SECRET;
    delete process.env.DEMO_SESSION_SECRET;
    try {
      const a = await import("@/lib/auth/demo-session");
      const { value } = await a.signDemoSession("demo-user");
      vi.resetModules();
      (globalThis as Record<string, unknown>).__ufDemoSecret = undefined;
      const b = await import("@/lib/auth/demo-session");
      expect(b).not.toBe(a);
      expect(await b.verifyDemoSession(value)).toBe("demo-user");
      expect(await b.verifyDemoSession(value.slice(0, -2) + "xx")).toBeNull();
    } finally {
      if (saved !== undefined) process.env.DEMO_SESSION_SECRET = saved;
    }
  });

  it("a configured secret is used when present", async () => {
    vi.resetModules();
    process.env.DEMO_SESSION_SECRET = "one-secret-0123456789";
    const a = await import("@/lib/auth/demo-session");
    const { value } = await a.signDemoSession("demo-user");
    process.env.DEMO_SESSION_SECRET = "another-secret-0123456789";
    vi.resetModules();
    const b = await import("@/lib/auth/demo-session");
    expect(await b.verifyDemoSession(value)).toBeNull();
    delete process.env.DEMO_SESSION_SECRET;
  });
});

describe("demo state shared between the page and /api functions", () => {
  it("changes made in one process show up in another after a snapshot sync", async () => {
    const { freshRepo } = await import("./helpers");
    const { exportDemoSnapshot, importDemoSnapshot, resetMemoryStore, MemoryRepository } = await import("@/lib/data/memory");
    // "/api" process: the user switches language and route.
    const api = freshRepo();
    await api.updateProfile({ language: "ja", home_country: "CN", study_country: "JP", home_currency: "CNY", study_currency: "JPY" });
    const snapshot = JSON.parse(JSON.stringify(exportDemoSnapshot()));
    expect(snapshot.country_rules).toBeUndefined(); // static reference data stays out of the snapshot
    // "page" process: its own fresh copy until it pulls the snapshot.
    resetMemoryStore("standard");
    expect((await new MemoryRepository().getProfile()).language).toBe("en");
    expect(importDemoSnapshot(snapshot)).toBe(true);
    const profile = await new MemoryRepository().getProfile();
    expect(profile.language).toBe("ja");
    expect([profile.home_country, profile.study_country]).toEqual(["CN", "JP"]);
    expect((await new MemoryRepository().listCountryRules()).length).toBeGreaterThan(50);
    // A snapshot from another store version is ignored rather than corrupting state.
    expect(importDemoSnapshot({ ...snapshot, __version: -1 })).toBe(false);
  });
});
