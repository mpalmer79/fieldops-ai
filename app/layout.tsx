import type { Metadata } from "next";
import { FieldOpsAssistant } from "@/components/fieldops-assistant";
import "./globals.css";

export const metadata: Metadata = {
  title: "FieldOps AI | Automotive Service Operations",
  description: "A production-grade dealership service decision system for repair-order recovery, technician capacity, human approval, and auditable execution.",
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
      <body className="antialiased">
        {children}
        <FieldOpsAssistant />
      </body>
    </html>
  );
}
