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
