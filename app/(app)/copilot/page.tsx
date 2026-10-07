import { getRepository } from "@/lib/session";
import { Copilot } from "@/components/copilot";

export const metadata = { title: "AI Copilot" };

export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const repo = await getRepository();
  const profile = await repo.getProfile();
  const { q } = await searchParams;
  return <Copilot initialPrompt={q?.slice(0, 300) ?? null} permissionLevel={profile.ai_permission_level} firstName={profile.full_name.split(" ")[0]} />;
}
