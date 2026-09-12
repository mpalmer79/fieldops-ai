import type { Metadata } from "next";
import "./globals.css";
import "./control-room.css";

export const metadata: Metadata = {
  title: "FieldOps AI | Auditable Dispatch Recovery",
  description: "A production-grade field service decision system for constraint-aware disruption recovery, human approval, and auditable execution.",
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
