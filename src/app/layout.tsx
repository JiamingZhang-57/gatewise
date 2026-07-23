import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://gatewise.pli9qubac.chatgpt.site"),
  title: "Gatewise — Your latest practical airport arrival",
  description:
    "Find the latest practical airport arrival time with a visual, data-backed advisor powered by Trigger.dev and ClickHouse.",
  openGraph: {
    title: "Gatewise — Your latest practical airport arrival",
    description:
      "One aggressive arrival target, an explorable airport-pressure curve, and every adjustment made visible.",
    images: ["/og.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gatewise — Your latest practical airport arrival",
    description:
      "One aggressive arrival target, an explorable airport-pressure curve, and every adjustment made visible.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
