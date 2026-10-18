import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { dataMode } from "@/lib/config";
import { WelcomeFlow } from "./welcome-flow";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("WelcomePage");
  return { title: t("metaTitle") };
}
export const viewport: Viewport = { themeColor: "#A84A1A" };
export const dynamic = "force-dynamic";

export default function WelcomePage() {
  return <WelcomeFlow mode={dataMode()} />;
}
