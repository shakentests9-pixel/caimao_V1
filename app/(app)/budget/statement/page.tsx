import { getTranslations } from "next-intl/server";
import { getRepository } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { StatementWorkspace } from "@/components/statements/statement-workspace";
import type { StatementAnalysis } from "@/lib/statements/analyse";

export async function generateMetadata() {
  const t = await getTranslations("StatementPage");
  return { title: t("metaTitle") };
}

export default async function StatementPage() {
  const repo = await getRepository();
  const t = await getTranslations("StatementPage");
  await repo.purgeExpiredStatements();
  const history = await repo.listStatements();
  const current = history[0] ?? null;
  const initial = current
    ? {
        upload: current,
        transactions: await repo.listStatementTransactions(current.id),
        analysis: ((await repo.getStatementAnalysis(current.id))?.result ?? null) as StatementAnalysis | null,
      }
    : null;

  return (
    <div className="space-y-2">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <StatementWorkspace initial={initial} history={history} />
    </div>
  );
}
