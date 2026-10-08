"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export function EmailReviewActions({
  platformPostId,
  status,
  disabled,
  onReviewed,
}: {
  platformPostId: string;
  status: string;
  disabled?: boolean;
  onReviewed?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const review = useMutation(
    orpc.newsletter.reviewCreative.mutationOptions({
      onSuccess: async () => {
        await onReviewed?.();
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const action =
    status === "approved"
      ? "reopen"
      : status === "pending_review"
        ? "approve"
        : ["slot", "draft"].includes(status)
          ? "ready"
          : null;
  if (!action) return null;
  return (
    <Button
      size="sm"
      variant={action === "approve" ? "default" : "outline"}
      disabled={disabled || review.isPending}
      onClick={() => review.mutate({ platformPostId, action })}
    >
      {action === "ready"
        ? "Mark ready"
        : action === "approve"
          ? "Approve creative"
          : "Reopen"}
    </Button>
  );
}
