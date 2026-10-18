import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "@fontsource-variable/manrope";
import "@fontsource-variable/nunito-sans";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    title: { default: "CaiMao", template: "%s · CaiMao" },
    description: t("description"),
    applicationName: "CaiMao",
  };
}

export const viewport: Viewport = { themeColor: "#FFF8F2", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === "en" ? "en-GB" : locale} className={GeistMono.variable}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
