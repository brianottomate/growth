import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { hasLabSession } from "@/server/lab-access";

// /lab — the team's internal workspace: exploratory pages, system maps,
// workbenches, and one-off tools. Open to any signed-in teammate; 404 for
// anonymous traffic (the lab isn't advertised). Diagnostic API siblings live
// under /api/lab/* behind the same gate (see src/server/lab-access.ts).

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
