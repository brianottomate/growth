"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";

import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { DeleteAlert } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { EditPersonDialog, type EditableMember } from "./EditPersonDialog";

export type MemberRow = EditableMember;

export type PendingRow = {
  id: string;
  email: string;
  role: string;
  createdAt: Date | null;
  expiresAt: Date | null;
};

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
  d
    ? new Date(d).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export function PeopleManager({
  organizationId,
  canManage,
  members,
  pending,
  currentUserId,
}: {
  organizationId: string;
  canManage: boolean;
  members: MemberRow[];
  pending: PendingRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);

  const refresh = () => router.refresh();

  const removeMember = useMutation(
    orpc.org.removeMember.mutationOptions({
      onSuccess: () => {
        toast.success("Member removed");
        setRemoveTarget(null);
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const cancelInvitation = useMutation(
    orpc.org.cancelInvitation.mutationOptions({
      onSuccess: () => {
        toast.success("Invitation canceled");
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          return (
            <div
              key={m.id}
              className="group flex items-center gap-3 rounded-xl border bg-card p-3"
            >
              {m.image ? (
                // oxlint-disable-next-line nextjs/no-img-element
                <img
                  src={m.image}
                  alt=""
                  className="size-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                  {initials(m.name, m.email)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name ?? m.email ?? "Unknown"}
                  {isSelf && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (you)
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.email ?? "—"}
                </div>
              </div>

              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                  ROLE_STYLE[m.role] ?? ROLE_STYLE.member
                }`}
              >
                {m.role}
              </span>

              <div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                {(isSelf || canManage) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    tone="muted-active"
                    className="size-7"
                    onClick={() => setEditTarget(m)}
                    aria-label="Edit member"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canManage && !isSelf && (
                  <Button
                    size="icon"
                    variant="ghost"
                    tone="muted-danger"
                    className="size-7"
                    onClick={() => setRemoveTarget(m)}
                    aria-label="Remove member"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pending.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Pending invitations · {pending.length}
          </h2>
          <div className="flex flex-col gap-2">
            {pending.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {inv.email}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Invited {fmtDate(inv.createdAt)} · expires{" "}
                    {fmtDate(inv.expiresAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      ROLE_STYLE[inv.role] ?? ROLE_STYLE.member
                    }`}
                  >
                    {inv.role}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    tone="muted-danger"
                    className=""
                    disabled={cancelInvitation.isPending}
                    onClick={() =>
                      cancelInvitation.mutate({
                        organizationId,
                        invitationId: inv.id,
                      })
                    }
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <EditPersonDialog
        organizationId={organizationId}
        canManage={canManage}
        member={editTarget}
        isSelf={editTarget?.userId === currentUserId}
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSaved={refresh}
      />

      <DeleteAlert
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        onConfirm={() =>
          removeTarget &&
          removeMember.mutate({
            organizationId,
            memberId: removeTarget.id,
          })
        }
        title={`Remove ${removeTarget?.name ?? removeTarget?.email ?? "this member"}?`}
        description="They'll lose access to this organization. You can add them back later."
        isLoading={removeMember.isPending}
      />
    </>
  );
}
