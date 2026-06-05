import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { invitationTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { AddPersonDialog } from "./AddPersonDialog";

const ROLE_STYLE: Record<string, string> = {
  owner: "bg-amber-500/15 text-amber-300",
  admin: "bg-sky-500/15 text-sky-300",
  member: "bg-muted text-muted-foreground",
};

function initials(name: string | null, email: string | null) {
  const base = name?.trim() || email?.split("@")[0] || "?";
  return base.slice(0, 2).toUpperCase();
}

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—";

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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <div
            key={m.id}
            className="bg-card flex items-center gap-3 rounded-xl border p-3"
          >
            {m.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.user.image}
                alt=""
                className="size-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {initials(m.user?.name ?? null, m.user?.email ?? null)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.user?.name ?? m.user?.email ?? "Unknown"}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {m.user?.email ?? "—"}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                ROLE_STYLE[m.role] ?? ROLE_STYLE.member
              }`}
            >
              {m.role}
            </span>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div>
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
            Pending invitations · {pending.length}
          </h2>
          <div className="flex flex-col gap-2">
            {pending.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-dashed p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{inv.email}</div>
                  <div className="text-muted-foreground text-xs">
                    Invited {fmtDate(inv.createdAt)} · expires {fmtDate(inv.expiresAt)}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                    ROLE_STYLE[inv.role] ?? ROLE_STYLE.member
                  }`}
                >
                  {inv.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
