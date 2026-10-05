"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { WorkspaceCard } from "@/app/app/performance/WorkspaceCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NewsletterChatStart } from "./NewsletterChatStart";
import { NewsletterTemplateStart } from "./NewsletterTemplateStart";

type Bucket = "Slots" | "Drafts" | "Planned";
export function EmailDraftsCard({
  emails,
  brandId,
  brandName,
  extraActions,
}: {
  emails: {
    id: string;
    title: string;
    bucket: Bucket;
    scheduledAt: string | null;
  }[];
  brandId?: string;
  brandName?: string;
  extraActions?: ReactNode;
}) {
  const [filter, setFilter] = useState<"All" | Bucket>("All");
  const visible = emails.filter(
    (email) => filter === "All" || email.bucket === filter,
  );
  return (
    <WorkspaceCard
      title="Emails"
      icon={Mail}
      count={emails.length}
      actions={
        <>
          {emails.length > 0 && (
            <>
              {brandId && <NewsletterTemplateStart brandId={brandId} />}
              <NewsletterChatStart brandId={brandId} brandName={brandName} />
            </>
          )}
          {extraActions}
        </>
      }
    >
      {emails.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap gap-1 rounded-lg border p-0.5"
            role="group"
            aria-label="Email status"
          >
            {(["All", "Slots", "Drafts", "Planned"] as const).map((bucket) => (
              <Button
                key={bucket}
                size="sm"
                variant={filter === bucket ? "secondary" : "ghost"}
                aria-pressed={filter === bucket}
                onClick={() => setFilter(bucket)}
              >
                {bucket}{" "}
                {bucket === "All"
                  ? emails.length
                  : emails.filter((email) => email.bucket === bucket).length}
              </Button>
            ))}
          </div>
          <Link
            href="/app/lifecycle"
            className="text-sm text-muted-foreground hover:underline"
          >
            Lifecycle
          </Link>
        </div>
      )}
      {visible.length ? (
        <div className="divide-y">
          {visible.map((email) => (
            <Link
              key={email.id}
              href={`/app/newsletters/${email.id}`}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-muted/40"
            >
              <span className="min-w-0 font-medium">{email.title}</span>
              <span className="text-muted-foreground">
                {email.bucket}
                {email.scheduledAt
                  ? ` · ${new Date(email.scheduledAt).toLocaleString()}`
                  : ""}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          icon={Mail}
          title={
            emails.length
              ? `No ${filter.toLowerCase()} emails`
              : "Create your first email"
          }
          actions={
            !emails.length ? (
              <>
                {brandId && (
                  <NewsletterTemplateStart brandId={brandId} primary />
                )}
                <NewsletterChatStart brandId={brandId} brandName={brandName} />
              </>
            ) : undefined
          }
          description={
            !emails.length
              ? "Start from a template, or shape an idea in chat."
              : undefined
          }
        />
      )}
    </WorkspaceCard>
  );
}
