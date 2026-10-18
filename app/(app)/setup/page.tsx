import { getTranslations } from "next-intl/server";
import { getRepository } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { SetupJourney } from "@/components/setup/setup-journey";
import { loadJourney } from "@/lib/banking/service";
import { isSupported } from "@/lib/banking/journey";

export async function generateMetadata() {
  const t = await getTranslations("Setup");
  return { title: t("metaTitle") };
}

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const repo = await getRepository();
  const t = await getTranslations("Setup");
  const { country } = await searchParams;
  // Viewing the plan reads the user's own data; creating/refreshing it is what gets logged as ACTION_PLAN_CREATED.
  const journey = await loadJourney({ repo, actor: "user", correlationId: null }, country && isSupported(country) ? country : undefined);
  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />
      <SetupJourney key={journey.country} journey={journey} />
    </div>
  );
}
