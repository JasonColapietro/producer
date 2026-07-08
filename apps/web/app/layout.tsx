import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const SITE_URL = "https://producer.suedeai.ai";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Producer by Suede Labs — AI video studio on autopilot",
  description:
    "Type a topic, get a finished video. Claude-written scripts, cinematic AI video via Kie.ai, cloned voiceover, burned-in captions — published to YouTube for pennies per render.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Producer by Suede Labs — AI video studio on autopilot",
    description:
      "Type a topic, get a finished video. Claude scripts, cinematic AI video, cloned voice, captions — pennies per render.",
    url: SITE_URL,
    siteName: "Producer by Suede Labs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Producer by Suede Labs — AI video studio on autopilot",
    description:
      "Type a topic, get a finished video. Claude scripts, cinematic AI video, cloned voice, captions — pennies per render.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
