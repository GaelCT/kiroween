import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reader",
  description: "A resurrected feed reader that shows what each source actually adds.",
  applicationName: "Reader",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Reader" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#dd4b39" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
