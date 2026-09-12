import type { Metadata } from "next";
import "./globals.css";
import "./control-room.css";

export const metadata: Metadata = {
  title: "FieldOps AI | Dispatch Command",
  description: "AI-assisted field service dispatch, routing, and operational recovery.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
