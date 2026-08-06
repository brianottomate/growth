import { isZernioConfigured } from "@/server/clients/zernio.client";

import { CommentList } from "./CommentList";
import {
  getRecentOrganicComments,
  LISTENING_WINDOW_DAYS,
} from "./zernio-listening";

export async function Comments() {
  if (!isZernioConfigured) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        Zernio isn&apos;t configured (no{" "}
        <code className="font-mono">ZERNIO_API_KEY</code>).
      </div>
    );
  }

  let result: Awaited<ReturnType<typeof getRecentOrganicComments>>;
  try {
    result = await getRecentOrganicComments();
  } catch (error) {
    return (
      <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
        <p className="font-semibold">Failed to fetch comments</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  if (result.comments.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        No comments on posts published in the last {LISTENING_WINDOW_DAYS} days
        across connected accounts.
      </div>
    );
  }

  return <CommentList items={result.comments} />;
}
