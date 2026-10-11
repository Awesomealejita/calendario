import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendario",
  description: "Tu agenda personal: gym, trabajo, citas y quehaceres, con Outlook, Holded y un asistente IA.",
  appleWebApp: { capable: true, title: "Calendario", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/192", apple: "/icons/180" },
};

export const viewport: Viewport = {
  themeColor: "#fff8f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const THEMES = new Set(["light", "dark", "auto"]);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get("theme")?.value;
  const theme = saved && THEMES.has(saved) ? saved : "light";
  return (
    <html lang="es" data-theme={theme}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
