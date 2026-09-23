import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { serverApi } from "@/orpc/server";

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
  const result = await serverApi.launch.get({ launchId }).catch((error) => {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const members = await db.query.memberTable.findMany({
    where: eq(memberTable.organizationId, membership.organizationId),
    with: { user: { columns: { id: true, name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <Link
        href="/app/launches"
        className="text-xs text-muted-foreground hover:text-foreground"
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
