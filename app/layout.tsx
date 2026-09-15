import type { Metadata } from "next";
import { FieldOpsAssistant } from "@/components/fieldops-assistant";
import "./globals.css";

const description = "A production-oriented automotive service operations prototype for constrained repair-order recovery, technician capacity, human approval, AgentOps, and auditable execution.";

export const metadata: Metadata = {
  metadataBase: new URL("https://fieldops-ai.up.railway.app"),
  title: {
    default: "FieldOps AI | Automotive Service Operations",
    template: "%s | FieldOps AI",
  },
  description,
  applicationName: "FieldOps AI",
  authors: [{ name: "Michael Palmer", url: "https://mpalmer79.github.io/" }],
  creator: "Michael Palmer",
  keywords: [
    "automotive service operations",
    "agentic AI",
    "decision support",
    "constraint optimization",
    "human in the loop",
    "AgentOps",
    "Next.js",
    "TypeScript",
  ],
  openGraph: {
    type: "website",
    url: "/",
    siteName: "FieldOps AI",
    title: "FieldOps AI | Automotive Service Operations",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "FieldOps AI | Automotive Service Operations",
    description,
  },
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
