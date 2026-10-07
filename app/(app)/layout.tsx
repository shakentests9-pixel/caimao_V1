import { redirect } from "next/navigation";
import { getRepositoryOrNull } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const repo = await getRepositoryOrNull();
  if (!repo) redirect("/welcome");
  const [profile, obligations] = await Promise.all([repo.getProfile(), repo.listObligations()]);
  const due = obligations.filter((o) => o.status === "PAYMENT_DUE").length;
  return (
    <AppShell name={profile.full_name} dueCount={due}>
      {children}
    </AppShell>
  );
}
