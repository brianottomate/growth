import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { readLaunch } from "@/server/services/launch.service";

import { LaunchDetail } from "./LaunchDetail";

export default async function LaunchPage({
  params,
}: {
  params: Promise<{ launchId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
  });
  if (!membership?.organizationId) redirect("/app");

  const { launchId } = await params;
  const result = await readLaunch(membership.organizationId, launchId);
  if (!result) notFound();

  const members = await db.query.memberTable.findMany({
    where: eq(memberTable.organizationId, membership.organizationId),
    with: { user: { columns: { id: true, name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <Link
        href="/app/launches"
        className="text-muted-foreground hover:text-foreground text-xs"
      >
        ← Launches
      </Link>
      <LaunchDetail
        initial={result}
        members={members
          .map((m) => m.user)
          .filter((u): u is NonNullable<typeof u> => Boolean(u))}
      />
    </div>
  );
}
