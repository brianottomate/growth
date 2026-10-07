"use client";
import { ReviewDiscussion } from "@/components/review/ReviewDiscussion";
export function CommentThread({
  contentPostId,
  currentUserId: _currentUserId,
}: {
  contentPostId: string;
  currentUserId: string;
}) {
  return (
    <ReviewDiscussion
      target={{ type: "content", id: contentPostId }}
      defaultOpen
    />
  );
}
