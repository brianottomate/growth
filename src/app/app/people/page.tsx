import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { invitationTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { AddPersonDialog } from "./AddPersonDialog";
import { PeopleManager } from "./PeopleManager";

export default async function PeoplePage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  const members = await db.query.memberTable.findMany({
    where: eq(memberTable.organizationId, org.id),
    with: { user: true },
    orderBy: [desc(memberTable.createdAt)],
  });

  const pending = await db.query.invitationTable.findMany({
    where: and(
      eq(invitationTable.organizationId, org.id),
      eq(invitationTable.status, "pending"),
    ),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">People</h1>
          <p className="text-muted-foreground text-sm">
            {members.length} member{members.length === 1 ? "" : "s"} in {org.name}
            {pending.length > 0 && ` · ${pending.length} pending`}
          </p>
        </div>
        <AddPersonDialog organizationId={org.id} />
      </div>

      <PeopleManager
        currentUserId={session.user.id}
        members={members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          name: m.user?.name ?? null,
          email: m.user?.email ?? null,
          image: m.user?.image ?? null,
        }))}
        pending={pending.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
        }))}
      />
    </div>
  );
}
