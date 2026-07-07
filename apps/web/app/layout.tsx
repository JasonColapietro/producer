import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://producer.suedeai.ai";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Producer by Suede Labs",
  description: "Faceless + avatar videos on autopilot — your keys, your channel, pennies per render.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Producer by Suede Labs",
    description: "Faceless + avatar videos on autopilot — your keys, your channel, pennies per render.",
    url: SITE_URL,
    siteName: "Producer by Suede Labs",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Producer by Suede Labs",
    description: "Faceless + avatar videos on autopilot — your keys, your channel, pennies per render.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
