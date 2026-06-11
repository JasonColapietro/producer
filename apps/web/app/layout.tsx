import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TubeForge",
  description: "Faceless + avatar YouTube automation — your keys, your channel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
