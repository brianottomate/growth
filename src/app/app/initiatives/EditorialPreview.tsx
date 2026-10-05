"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previewDate } from "./WorkPreview";

type EditorialItem = {
  id: string;
  contentPostId: string;
  externalId: string | null;
  kind: "email" | "blog";
  title: string;
  description: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  media: { url: string; thumbnail: string | null }[];
};

export function EditorialPreview({
  item,
  kind = "email",
  seriesName,
  actions,
}: {
  item?: EditorialItem;
  kind?: "email" | "blog";
  seriesName?: string;
  actions?: ReactNode;
}) {
  const type = item?.kind ?? kind;
  const email = type === "email";
  const Icon = email ? Mail : FileText;
  const label = email ? "Email blast" : "Blog post";
  if (!item)
    return (
      <article className="flex items-start gap-3 rounded-xl border border-dashed p-4">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{label}</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            No {email ? "email" : "blog"} versions linked yet.
          </p>
          {actions}
        </div>
      </article>
    );
  const href = email
    ? `/app/newsletters/${item.id}`
    : item.externalId
      ? `/app/blog/${item.id}`
      : `/app/content/${item.contentPostId}`;
  const cover = item.media[0];
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </span>
        <span className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground capitalize">
          {item.status === "slot"
            ? "Planned"
            : item.status.replaceAll("_", " ")}
        </span>
      </div>
      <div className="flex items-start gap-3">
        {!email && cover && (
          <Image
            unoptimized
            src={cover.thumbnail ?? cover.url}
            alt=""
            width={96}
            height={72}
            className="h-18 w-24 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 space-y-1">
          <Link
            href={href}
            className="line-clamp-2 text-sm font-medium hover:underline"
          >
            {item.title}
          </Link>
          {item.description && (
            <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {seriesName ? `From ${seriesName}` : "Directly linked content"}
        </span>
        <span>
          {item.publishedAt
            ? `Published ${previewDate(item.publishedAt)}`
            : item.scheduledAt
              ? `Scheduled ${previewDate(item.scheduledAt)}`
              : null}
        </span>
      </div>
      {actions}
      <Button variant="outline" size="sm" asChild>
        <Link href={href}>Open {email ? "email" : "article"}</Link>
      </Button>
    </article>
  );
}
