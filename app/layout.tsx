import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev Trip — Two Minds, One Trip",
  description: "An LLM plans the day while Jev evaluates choices, routes, and the evolving itinerary.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
