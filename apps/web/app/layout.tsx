import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Producer by Suede Labs",
  description: "Faceless + avatar videos on autopilot — your keys, your channel, pennies per render.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
