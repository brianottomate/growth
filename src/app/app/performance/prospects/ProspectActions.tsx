"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { useTRPC } from "@/trpc/react";

/** Set a prospect up in chat, or mark them signed. */
export function ProspectActions({
  brandId,
  website,
}: {
  brandId: string;
  website: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const promote = useMutation(
    trpc.performance.setBrandRelationship.mutationOptions({
      onSuccess: () => {
        toast.success("Now a client");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <div className="flex items-center gap-1.5">
      {website ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() =>
            sendAssistantIntent({
              type: "set_up_client",
              website,
              visibleText: `Set up ${website.replace(/^https?:\/\//, "")}: mark, photos, a campaign shell and first ads from their homes. Stop before pushing.`,
            })
          }
        >
          <MessageSquare className="size-3" />
          Set up in chat
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px]"
        disabled={promote.isPending}
        onClick={() => promote.mutate({ brandId, relationship: "client" })}
      >
        <UserCheck className="size-3" />
        Signed
      </Button>
    </div>
  );
}
