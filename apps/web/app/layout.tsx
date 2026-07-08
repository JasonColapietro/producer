import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const SITE_URL = "https://producer.suedeai.ai";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  weight: ["400"],
  variable: "--font-instrument-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Suede Cinema — AI video studio on autopilot",
  description:
    "Type a topic, get a finished video. Claude-written scripts, cinematic AI video via Kie.ai, cloned voiceover, burned-in captions — published to YouTube for pennies per render.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Suede Cinema — AI video studio on autopilot",
    description:
      "Type a topic, get a finished video. Claude scripts, cinematic AI video, cloned voice, captions — pennies per render.",
    url: SITE_URL,
    siteName: "Suede Cinema",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Suede Cinema — AI video studio on autopilot",
    description:
      "Type a topic, get a finished video. Claude scripts, cinematic AI video, cloned voice, captions — pennies per render.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
