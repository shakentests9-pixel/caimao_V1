"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "./ui/button";

export function LoginForm({ mode, next }: { mode: "memory" | "supabase"; next: string }) {
  const t = useTranslations("LoginForm");
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
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(20_000) });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    } catch {
      // Network failure or timeout: never leave the button spinning.
      return { ok: false, data: {} as { error?: string } };
    } finally {
      setBusy(false);
    }
  }

  if (mode === "memory") {
    return (
      <div>
        <div className="flex items-center gap-3 rounded-[22px] bg-white p-4 shadow-card">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-peach font-display font-extrabold text-cocoa">AT</span>
          <div>
            <div className="text-[16px] font-extrabold text-cocoa">Alex Tan</div>
            <div className="text-[14px] text-muted">{t("demoRoute")} · Example University</div>
          </div>
        </div>
        <Button
          size="lg"
          className="mt-5 w-full"
          disabled={busy}
          onClick={async () => {
            const r = await post("/api/auth/demo");
            // Full navigation so the new session cookie is used straight away.
            if (r.ok) window.location.assign(safeNext);
            else setError(r.data.error ?? t("signInFailed"));
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : null} {t("continueAs", { name: "Alex Tan" })}
        </Button>
        {error && <p className="mt-3 text-[14px] text-error-ink">{error}</p>}
        <p className="mt-6 text-[13px] leading-5 text-muted">{t("configureSupabase")}</p>
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
        } else setError(r.data.error ?? t("signInFailed"));
      }}
    >
      <label className="block">
        <span className="text-[13.5px] font-bold text-cocoa">{t("email")}</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-12 w-full rounded-[14px] bg-white px-4 text-[16px] shadow-card outline-none ring-1 ring-line focus:ring-2 focus:ring-gold" />
      </label>
      <label className="block">
        <span className="text-[13.5px] font-bold text-cocoa">{t("password")}</span>
        <input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-12 w-full rounded-[14px] bg-white px-4 text-[16px] shadow-card outline-none ring-1 ring-line focus:ring-2 focus:ring-gold" />
      </label>
      {error && <p className="text-[14px] text-error-ink">{error}</p>}
      {info && <p className="text-[14px] text-success-ink">{info}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null} {t("signIn")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy || !email || password.length < 8}
        onClick={async () => {
          const r = await post("/api/auth/signup", { email, password });
          if (!r.ok) return setError(r.data.error ?? t("signUpFailed"));
          if (r.data.needs_confirmation) setInfo(t("checkInbox"));
          else {
            router.push(safeNext);
            router.refresh();
          }
        }}
      >
        {t("createAccount")}
      </Button>
    </form>
  );
}
