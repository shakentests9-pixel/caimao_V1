import Link from "next/link";
import { CalendarDays, ChevronRight, CreditCard, FileText, Globe2, ShieldCheck, Settings } from "lucide-react";
import { getRepository } from "@/lib/session";
import { COUNTRY_NAMES } from "@/lib/types";
import { formatMoney } from "@/lib/fx/service";
import { Avatar } from "@/components/brand";
import { RoutePair } from "@/components/country-chip";
import { PERMISSION_COPY } from "@/components/permission-chip";
import { SignOutButton } from "@/components/settings-forms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const repo = await getRepository();
  const [profile, obligations, executions] = await Promise.all([repo.getProfile(), repo.listObligations(), repo.listExecutions()]);
  const due = obligations.filter((o) => o.status === "PAYMENT_DUE").length;
  const latest = executions[0];
  const perm = PERMISSION_COPY[profile.ai_permission_level];
  const settings = [
    { href: "/settings#personalisation", label: "Currency & region", sub: `Balances in ${profile.base_currency}`, Icon: Globe2 },
    { href: "/settings#security", label: "Security", sub: "Sign-in, masking and approvals", Icon: ShieldCheck },
    { href: "/settings#documents", label: "Documents", sub: `${profile.documents_on_file.length} ready`, Icon: FileText },
    { href: "/obligations", label: "Bills & obligations", sub: due ? `${due} payment${due === 1 ? "" : "s"} due` : "All caught up", Icon: CalendarDays },
    { href: "/banking", label: "Banking & Credit", sub: "Card, credit profile and bank setup", Icon: CreditCard },
    { href: "/settings#demo", label: "Advanced", sub: "Demo scenarios and system info", Icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4 pt-1">
        <Avatar name={profile.full_name} size={64} />
        <div className="min-w-0">
          <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.05em] text-cocoa">{profile.full_name}</h1>
          <p className="text-[15px] text-muted">
            {profile.university} · {COUNTRY_NAMES[profile.home_country]} → {COUNTRY_NAMES[profile.study_country]}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <section className="rounded-[24px] bg-white p-5 shadow-card">
            <dl className="grid grid-cols-2 gap-4 text-[14px]">
              <div>
                <dt className="font-semibold text-muted">Route</dt>
                <dd className="mt-1.5"><RoutePair from={profile.home_country} to={profile.study_country} size={30} /></dd>
              </div>
              <div>
                <dt className="font-semibold text-muted">Currencies</dt>
                <dd className="mt-1.5 font-mono font-semibold text-cocoa">{profile.home_currency} · {profile.study_currency}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[24px] bg-white px-2 py-2 shadow-card" aria-label="Settings">
            <h2 className="px-3 pb-1 pt-3 font-display text-[19px] font-extrabold tracking-[-0.03em] text-cocoa">Settings</h2>
            <ul>
              {settings.map(({ href, label, sub, Icon }) => (
                <li key={label}>
                  <Link href={href} className="flex min-h-[64px] items-center gap-3.5 rounded-[18px] px-3 transition-colors hover:bg-ivory">
                    <span className="flex size-10 items-center justify-center rounded-[14px] bg-cream text-cocoa-2">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-bold text-cocoa">{label}</span>
                      <span className="block truncate text-[13px] text-muted">{sub}</span>
                    </span>
                    <ChevronRight className="size-5 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <SignOutButton />
        </div>

        <div className="space-y-6">
          <section className="rounded-[24px] bg-white p-5 shadow-card sm:p-6">
            <h2 className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-cocoa">How CaiMao can help</h2>
            <p className="mt-1 text-[14.5px] text-muted">Payments always require your approval.</p>
            <div className="mt-4 flex items-center gap-4 rounded-[18px] border-2 border-brand bg-brand-soft p-4">
              <span className="flex size-11 items-center justify-center rounded-[14px] bg-brand text-white">
                <perm.Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold text-cocoa">{perm.name}</span>
                <span className="block text-[14px] text-muted">{perm.text}</span>
              </span>
            </div>
            <Link href="/settings#ai" className="mt-3 inline-flex min-h-11 items-center gap-1 text-[14.5px] font-bold text-brand hover:underline">
              Change what CaiMao can do <ChevronRight className="size-4" />
            </Link>
          </section>

          <section className="rounded-[24px] bg-white p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-cocoa">Activity &amp; Security</h2>
              {latest ? <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[12px] font-extrabold text-gold-ink">Verified transfer</span> : null}
            </div>
            {latest ? (
              <p className="mt-1 text-[14.5px] text-muted">
                <span className="font-mono">{latest.transaction_id}</span> · {formatMoney(latest.destination_amount, latest.destination_currency)} · Completed
              </p>
            ) : (
              <p className="mt-1 text-[14.5px] text-muted">Your payments and every check behind them will appear here.</p>
            )}
            <Link href="/evidence" className={cn("cm-press mt-4 flex h-12 items-center justify-center gap-2 rounded-[16px] bg-cream text-[15px] font-extrabold text-cocoa hover:bg-sand")}>
              <ShieldCheck className="size-[18px]" /> Open Activity &amp; Security
            </Link>
          </section>

        </div>
      </div>
    </div>
  );
}
