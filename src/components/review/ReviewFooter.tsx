import type { ReactNode } from "react";
import { OwnerAvatar, type Member } from "@/components/assignment/assignee";
import type { ReviewTarget } from "@/lib/review-target";
import { ReviewDiscussion } from "./ReviewDiscussion";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

export function ReviewFooter({
  status,
  target,
  reviewer,
  children,
}: {
  status: "draft" | "ready" | "approved";
  target: ReviewTarget;
  reviewer?: Member | null;
  children?: ReactNode;
}) {
  return (
    <footer className="border-t pt-3">
      <ReviewDiscussion
        target={target}
        actions={children}
        summary={
          <>
            <ReviewStatusBadge status={status} />
            {reviewer && <OwnerAvatar member={reviewer} size="sm" />}
          </>
        }
      />
    </footer>
  );
}
