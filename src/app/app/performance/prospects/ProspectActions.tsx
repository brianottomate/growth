"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, MessageSquare, UserCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { useTRPC } from "@/trpc/react";

/** Set a prospect up in chat, or mark them signed. */
export function ProspectActions({
  brandId,
  website,
  intakeUrl,
}: {
  brandId: string;
  website: string | null;
  intakeUrl: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const promote = useMutation(
    trpc.performance.setBrandRelationship.mutationOptions({
      onSuccess: () => {
        toast.success("Now a client");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const pillClass = "h-auto rounded-full px-3 py-1 text-[11.5px] font-semibold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {intakeUrl ? (
        <Button
          size="sm"
          variant="outline"
          className={pillClass}
          onClick={async () => {
            await navigator.clipboard.writeText(intakeUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy intake link"}
        </Button>
      ) : null}
      {website ? (
        <Button
          size="sm"
          variant="outline"
          className={pillClass}
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
        className={pillClass}
        disabled={promote.isPending}
        onClick={() => promote.mutate({ brandId, relationship: "client" })}
      >
        <UserCheck className="size-3" />
        Signed
      </Button>
    </div>
  );
}
