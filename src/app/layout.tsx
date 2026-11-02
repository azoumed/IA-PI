import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veille PI Maroc",
  description: "Veille et gestion des dossiers de propriété industrielle (OMPIC)",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getI18n();
  return (
    <html lang={locale} dir={dir} className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
