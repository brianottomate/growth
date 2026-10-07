"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { AssigneeButton, type Member } from "@/components/assignment/assignee";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/** The client's people as the card's last row: the CSM, then the lead. */
export function CardStaff({
  brandId,
  lead,
  csLead,
  className,
}: {
  brandId: string;
  lead: Member | null;
  csLead: Member | null;
  className?: string;
}) {
  const router = useRouter();
  const roster = useQuery({
    ...orpc.performance.staffRoster.queryOptions(),
    staleTime: 5 * 60_000,
  });
  const write = useMutation({
    ...orpc.performance.setStaff.mutationOptions(),
    onSuccess: () => router.refresh(),
    onError: (error) => toast.error(error.message),
  });
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {(
        [
          { role: "cs", value: csLead, label: "CSM" },
          { role: "lead", value: lead, label: "Lead" },
        ] as const
      ).map(({ role, value, label }) => (
        <span key={role} className="inline-flex min-w-0 items-center gap-1.5">
          <AssigneeButton
            value={value}
            members={roster.data?.members ?? []}
            currentUserId={roster.data?.currentUserId ?? ""}
            size="sm"
            label={`Set ${label}`}
            clearLabel={`Clear ${label}`}
            onChange={(userId) => write.mutate({ brandId, role, userId })}
          />
          <span className="truncate">
            {role === "cs" ? <span className="font-medium">CSM </span> : null}
            {value?.name ?? (role === "lead" ? "No lead" : null)}
          </span>
        </span>
      ))}
    </div>
  );
}
