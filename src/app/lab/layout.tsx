import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { hasLabSession } from "@/server/lab-access";

// /lab — Kristian's private workspace: exploratory pages, system maps, and
// one-off tools. Admin-gated (404 for everyone else — the lab isn't
// advertised). Diagnostic API siblings live under /api/lab/* behind the same
// gate (see src/server/lab-access.ts).

export const metadata: Metadata = {
  title: "Lab",
  robots: { index: false, follow: false },
};

export default async function LabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasLabSession())) notFound();
  return children;
}
