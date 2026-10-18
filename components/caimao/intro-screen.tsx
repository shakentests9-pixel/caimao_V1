"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Sparkles, Globe2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { CaiMaoMark, Wordmark } from "../brand";

/**
 * First-time intro. "Get started" signs in to the demo account in local mode,
 * or opens account creation when Supabase is configured.
 */
export function IntroScreen({ mode }: { mode: "memory" | "supabase" }) {
  const t = useTranslations("IntroScreen");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (mode === "supabase") return router.push("/login?signup=1");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/demo", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError(t("demoError"));
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-ivory">
      <div className="mx-auto flex min-h-dvh max-w-[620px] flex-col px-5 pb-8 pt-8 sm:pt-12">
        <Wordmark />
        <div className="mt-8 flex flex-1 flex-col justify-center sm:mt-12">
          <section className="rounded-[28px] bg-white p-6 text-center shadow-card sm:p-10">
            <div className="mx-auto overflow-hidden rounded-[26px] bg-brand px-3 pt-4">
              <CaiMaoMark priority className="mx-auto max-w-[440px]" />
            </div>
            <h1 className="mt-7 font-display text-[32px] font-extrabold leading-[1.08] tracking-[-0.06em] text-cocoa sm:text-[40px]">{t("headline")}</h1>
            <p className="mx-auto mt-4 max-w-[44ch] text-[16px] leading-[1.6] text-muted">
              {t("intro")}
            </p>
            <ul className="mx-auto mt-6 grid max-w-[460px] gap-2 text-left text-[14.5px] text-cocoa-2 sm:grid-cols-3 sm:gap-3 sm:text-center">
              <li className="flex items-center gap-2 rounded-[16px] bg-cream px-3 py-2.5 sm:flex-col sm:gap-1.5"><Globe2 className="size-[18px] text-brand" /> {t("featureArrives")}</li>
              <li className="flex items-center gap-2 rounded-[16px] bg-cream px-3 py-2.5 sm:flex-col sm:gap-1.5"><Sparkles className="size-[18px] text-brand" /> {t("featureLegwork")}</li>
              <li className="flex items-center gap-2 rounded-[16px] bg-cream px-3 py-2.5 sm:flex-col sm:gap-1.5"><ShieldCheck className="size-[18px] text-brand" /> {t("featureApprove")}</li>
            </ul>
            <button onClick={start} disabled={busy} className="cm-press cm-cta mt-8 flex h-[54px] w-full items-center justify-center gap-2 rounded-[16px] text-[16px] font-extrabold disabled:opacity-60">
              {busy ? <Loader2 className="size-5 animate-spin" /> : null} {t("getStarted")}
            </button>
            <Link href="/login" className="mt-2 flex h-12 w-full items-center justify-center rounded-[16px] text-[16px] font-bold text-brand hover:bg-brand-soft">
              {t("haveAccount")}
            </Link>
            {error ? <p className="mt-2 text-[14px] text-error-ink">{error}</p> : null}
          </section>
          <p className="mt-5 text-center text-[13px] text-muted">{t("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
