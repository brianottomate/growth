import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/server/better-auth/server";
import { AppHeader } from "./AppHeader";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/signin");
  }

  return (
    <div className="bg-background text-foreground min-h-screen">
      <AppHeader session={session} />
      <main className="mx-auto max-w-7xl p-6 lg:px-8">{children}</main>
    </div>
  );
}
