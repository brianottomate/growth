"use client";

// Client islands for the (server-rendered) content detail page: assign the
// idea owner (content_post) and per-channel spot owners (platform_post). Both
// optimistically update local state and reconcile via router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import {
  AssigneeButton,
  useSelfAssignHotkey,
  type Member,
} from "@/components/assignment/assignee";

export function IdeaOwnerControl({
  contentPostId,
  initialOwner,
  members,
  currentUserId,
}: {
  contentPostId: string;
  initialOwner: Member | null;
  members: Member[];
  currentUserId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [owner, setOwner] = useState<Member | null>(initialOwner);
  const mut = useMutation(
    trpc.content.setOwner.mutationOptions({
      onSettled: () => router.refresh(),
    }),
  );
  const change = (ownerId: string | null) => {
    setOwner(ownerId ? (members.find((m) => m.id === ownerId) ?? null) : null);
    mut.mutate({ contentPostId, ownerId });
  };
  const hover = useSelfAssignHotkey({
    ownerId: owner?.id ?? null,
    currentUserId,
    onChange: change,
  });
  return (
    <span {...hover} className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Owner</span>
      <AssigneeButton
        value={owner}
        members={members}
        currentUserId={currentUserId}
        onChange={change}
        size="md"
      />
    </span>
  );
}

export function SpotOwnerControl({
  platformPostId,
  initialOwner,
  members,
  currentUserId,
}: {
  platformPostId: string;
  initialOwner: Member | null;
  members: Member[];
  currentUserId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [owner, setOwner] = useState<Member | null>(initialOwner);
  const mut = useMutation(
    trpc.content.setSpotOwner.mutationOptions({
      onSettled: () => router.refresh(),
    }),
  );
  const change = (ownerId: string | null) => {
    setOwner(ownerId ? (members.find((m) => m.id === ownerId) ?? null) : null);
    mut.mutate({ platformPostId, ownerId });
  };
  const hover = useSelfAssignHotkey({
    ownerId: owner?.id ?? null,
    currentUserId,
    onChange: change,
  });
  return (
    <span {...hover}>
      <AssigneeButton
        value={owner}
        members={members}
        currentUserId={currentUserId}
        onChange={change}
        size="sm"
        label="Assign this channel"
      />
    </span>
  );
}
