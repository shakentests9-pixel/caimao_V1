import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/manrope";
import "@fontsource-variable/nunito-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CaiMao", template: "%s · CaiMao" },
  description: "Study abroad. Manage money smarter. CaiMao helps international students pay tuition, compare transfers, manage currencies and approve every payment themselves.",
  applicationName: "CaiMao",
};

export const viewport: Viewport = { themeColor: "#FFF8F2", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={GeistMono.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
