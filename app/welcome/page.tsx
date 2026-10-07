import type { Metadata, Viewport } from "next";
import { dataMode } from "@/lib/config";
import { WelcomeFlow } from "./welcome-flow";

export const metadata: Metadata = { title: "Welcome" };
export const viewport: Viewport = { themeColor: "#A84A1A" };
export const dynamic = "force-dynamic";

export default function WelcomePage() {
  return <WelcomeFlow mode={dataMode()} />;
}
