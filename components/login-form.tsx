"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";

export function LoginForm({ mode, next }: { mode: "memory" | "supabase"; next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    return { ok: res.ok, data };
  }

  if (mode === "memory") {
    return (
      <div>
        <div className="flex items-center gap-3 rounded-[22px] bg-white p-4 shadow-card">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-peach font-display font-extrabold text-cocoa">AT</span>
          <div>
            <div className="text-[16px] font-extrabold text-cocoa">Alex Tan</div>
            <div className="text-[14px] text-muted">Singapore → UK · Example University</div>
          </div>
        </div>
        <Button
          size="lg"
          className="mt-5 w-full"
          disabled={busy}
          onClick={async () => {
            const r = await post("/api/auth/demo");
            if (r.ok) {
              router.push(safeNext);
              router.refresh();
            } else setError(r.data.error ?? "Sign-in failed.");
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : null} Continue as Alex Tan
        </Button>
        {error && <p className="mt-3 text-[14px] text-error-ink">{error}</p>}
        <p className="mt-6 text-[13px] leading-5 text-muted">Configure Supabase in .env.local to use real accounts with row-level security.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("/api/auth/login", { email, password });
        if (r.ok) {
          router.push(safeNext);
          router.refresh();
        } else setError(r.data.error ?? "Sign-in failed.");
      }}
    >
      <label className="block">
        <span className="text-[13.5px] font-bold text-cocoa">Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-12 w-full rounded-[14px] bg-white px-4 text-[16px] shadow-card outline-none ring-1 ring-line focus:ring-2 focus:ring-gold" />
      </label>
      <label className="block">
        <span className="text-[13.5px] font-bold text-cocoa">Password</span>
        <input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-12 w-full rounded-[14px] bg-white px-4 text-[16px] shadow-card outline-none ring-1 ring-line focus:ring-2 focus:ring-gold" />
      </label>
      {error && <p className="text-[14px] text-error-ink">{error}</p>}
      {info && <p className="text-[14px] text-success-ink">{info}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null} Sign in
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy || !email || password.length < 8}
        onClick={async () => {
          const r = await post("/api/auth/signup", { email, password });
          if (!r.ok) return setError(r.data.error ?? "Sign-up failed.");
          if (r.data.needs_confirmation) setInfo("Check your inbox to confirm your email, then sign in.");
          else {
            router.push(safeNext);
            router.refresh();
          }
        }}
      >
        Create account
      </Button>
    </form>
  );
}
