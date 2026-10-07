import { dataMode } from "@/lib/config";
import { LoginForm } from "@/components/login-form";
import { CaiMaoMark, Wordmark } from "@/components/brand";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; signup?: string }> }) {
  const { next, signup } = await searchParams;
  const mode = dataMode();
  return (
    <div className="grid min-h-dvh bg-ivory lg:grid-cols-[1.1fr_1fr]">
      <div className="relative isolate m-3 hidden flex-col justify-between overflow-hidden rounded-[32px] bg-brand p-10 text-white lg:flex">
        <Wordmark light size={44} />
        <div className="max-w-[520px]">
          <CaiMaoMark priority className="-ml-4" />
          <p className="mt-6 font-display text-[44px] font-extrabold leading-[1.04] tracking-[-0.06em]">Study abroad. Manage money smarter.</p>
          <p className="mt-4 max-w-[44ch] text-[17px] leading-7 text-cream">Pay tuition across borders, see exactly what arrives, and stay in control: CaiMao does the legwork, you approve every payment.</p>
        </div>
        <p className="text-[13px] text-cream/90">Competition prototype · sandbox payments only · regulatory data is simulated</p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <Wordmark className="mb-10 lg:hidden" />
          <h1 className="font-display text-[34px] font-extrabold leading-tight tracking-[-0.05em] text-cocoa">{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-[15.5px] text-muted">{mode === "memory" ? "Local demo mode. Sign in as our demo student to try everything." : "Sign in to CaiMao. New accounts start with demo data."}</p>
          <div className="mt-8">
            <LoginForm mode={mode} next={next ?? "/"} />
          </div>
        </div>
      </div>
    </div>
  );
}
