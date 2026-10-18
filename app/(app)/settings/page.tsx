import { EyeOff, KeyRound, Lock, ShieldCheck, FlaskConical } from "lucide-react";
import { getRepository } from "@/lib/session";
import { SCENARIOS } from "@/lib/seed";
import { agentMode, dataMode } from "@/lib/config";
import { DEFAULT_MODEL } from "@/lib/agent/orchestrator";
import { PageHeader } from "@/components/page-header";
import { CurrencyPreference, DocumentsForm, PermissionForm, ScenarioForm, SignOutButton } from "@/components/settings-forms";
import { SettingsSection } from "@/components/caimao/settings-section";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("SettingsPage");
  return { title: t("metaTitle") };
}

export default async function SettingsPage() {
  const repo = await getRepository();
  const [profile, scenario] = await Promise.all([repo.getProfile(), repo.getScenario()]);
  const agent = agentMode();
  const supa = dataMode() === "supabase";
  const t = await getTranslations("SettingsPage");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <nav className="cm-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1" aria-label={t("sectionsNav")}>
        {[
          ["personalisation", t("nav.personalisation")],
          ["ai", t("nav.ai")],
          ["security", t("nav.security")],
          ["documents", t("nav.documents")],
          ["demo", t("nav.demo")],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="flex min-h-11 shrink-0 items-center rounded-[14px] bg-white px-4 text-[14px] font-bold text-cocoa-2 shadow-card hover:text-brand">
            {label}
          </a>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <SettingsSection id="personalisation" title={t("personalisation.title")} description={t("personalisation.description")}>
            <CurrencyPreference base={profile.base_currency} />
          </SettingsSection>
          <SettingsSection id="ai" title={t("ai.title")} description={t("ai.description")}>
            <PermissionForm level={profile.ai_permission_level} />
          </SettingsSection>
          <SettingsSection id="demo" title={t("demo.title")} description={t("demo.description")}>
            <ScenarioForm scenarios={SCENARIOS} current={scenario} />
            <dl className="mt-5 space-y-2 rounded-[18px] bg-cream p-4 text-[14px]">
              {[
                [t("info.data"), supa ? t("info.dataSupabase") : t("info.dataLocal")],
                [t("info.ai"), agent === "llm" ? t("info.aiLlm", { model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL }) : t("info.aiPlanner")],
                [t("info.rules"), t("info.rulesValue")],
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
          <SettingsSection id="security" title={t("security.title")}>
            <ul className="space-y-3">
              {[
                { id: "signin", Icon: KeyRound, title: supa ? t("security.signInEmail") : t("security.signInDemo"), text: supa ? t("security.signedInAs", { email: profile.email }) : t("security.signedInAsDemo", { name: profile.full_name }) },
                { id: "approval", Icon: Lock, title: t("security.approvalTitle"), text: t("security.approvalText") },
                { id: "masked", Icon: EyeOff, title: t("security.maskedTitle"), text: t("security.maskedText") },
                { id: "log", Icon: ShieldCheck, title: t("security.logTitle"), text: t("security.logText") },
                { id: "sandbox", Icon: FlaskConical, title: t("security.sandboxTitle"), text: t("security.sandboxText") },
              ].map(({ id, Icon, title, text }) => (
                <li key={id} className="flex items-start gap-3">
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
          <SettingsSection id="documents" title={t("documents.title")} description={t("documents.description")}>
            <DocumentsForm onFile={profile.documents_on_file} />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
