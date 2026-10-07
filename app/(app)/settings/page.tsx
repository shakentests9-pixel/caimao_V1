import { EyeOff, KeyRound, Lock, ShieldCheck, FlaskConical } from "lucide-react";
import { getRepository } from "@/lib/session";
import { SCENARIOS } from "@/lib/seed";
import { agentMode, dataMode } from "@/lib/config";
import { DEFAULT_MODEL } from "@/lib/agent/orchestrator";
import { PageHeader } from "@/components/page-header";
import { CurrencyPreference, DocumentsForm, PermissionForm, ScenarioForm, SignOutButton } from "@/components/settings-forms";
import { SettingsSection } from "@/components/caimao/settings-section";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const repo = await getRepository();
  const [profile, scenario] = await Promise.all([repo.getProfile(), repo.getScenario()]);
  const agent = agentMode();
  const supa = dataMode() === "supabase";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <nav className="cm-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1" aria-label="Settings sections">
        {[
          ["personalisation", "Personalisation"],
          ["ai", "CaiMao permissions"],
          ["security", "Security"],
          ["documents", "Documents"],
          ["demo", "Demo settings"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="flex min-h-11 shrink-0 items-center rounded-[14px] bg-white px-4 text-[14px] font-bold text-cocoa-2 shadow-card hover:text-brand">
            {label}
          </a>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <SettingsSection id="personalisation" title="Personalisation" description="Which currency your total balance is shown in.">
            <CurrencyPreference base={profile.base_currency} />
          </SettingsSection>
          <SettingsSection id="ai" title="How CaiMao can help" description="Payments always require your approval.">
            <PermissionForm level={profile.ai_permission_level} />
          </SettingsSection>
          <SettingsSection id="demo" title="Demo settings" description="Load a fresh dataset to rehearse a different outcome.">
            <ScenarioForm scenarios={SCENARIOS} current={scenario} />
            <dl className="mt-5 space-y-2 rounded-[18px] bg-cream p-4 text-[14px]">
              {[
                ["Data", supa ? "Supabase PostgreSQL with row-level security" : "Local demo store"],
                ["AI", agent === "llm" ? `Claude tool calling · ${process.env.ANTHROPIC_MODEL || DEFAULT_MODEL}` : "Built-in planner (add ANTHROPIC_API_KEY to use Claude)"],
                ["Rules", "Simulated demo regulations"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[4.5rem_1fr] gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-cocoa">{v}</dd>
                </div>
              ))}
            </dl>
          </SettingsSection>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <SettingsSection id="security" title="Security">
            <ul className="space-y-3">
              {[
                { Icon: KeyRound, title: supa ? "Email and password" : "Demo sign-in", text: supa ? `Signed in as ${profile.email}` : `Signed in as ${profile.full_name} (demo)` },
                { Icon: Lock, title: "Every payment needs you", text: "CaiMao prepares payments; only you can approve them." },
                { Icon: EyeOff, title: "Account numbers stay masked", text: "Only the last four digits are stored or shown." },
                { Icon: ShieldCheck, title: "Tamper-proof activity log", text: "Every check and payment is recorded and can't be edited." },
                { Icon: FlaskConical, title: "Sandbox mode", text: "No real money moves in this demo." },
              ].map(({ Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-cream text-cocoa-2">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-extrabold text-cocoa">{title}</span>
                    <span className="block text-[14px] text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <SignOutButton className="mt-6" />
          </SettingsSection>
          <SettingsSection id="documents" title="Documents" description="CaiMao checks these against each transfer rule. Remove one to see a transfer flagged as action required.">
            <DocumentsForm onFile={profile.documents_on_file} />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
