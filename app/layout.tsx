import type { Metadata } from "next";
import Script from "next/script";
import { socialPreviewMetadata } from "@/lib/social-preview";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://unmumble.online"),
  title: "Unmumble",
  description: "Connect the sounds with the words. Listen, check, repeat, and hear real English clearly.",
  other: { "codex-preview": "development" },
  ...socialPreviewMetadata(),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg?v=8" type="image/svg+xml" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#0d1116" />
        <Script src="/theme-controller.js" strategy="beforeInteractive" />
      </head>
      <body>
        {children}
        <Script src="/feedback-widget.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
