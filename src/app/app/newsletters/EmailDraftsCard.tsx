"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Mail,
  ChevronDown,
  ArrowUpRight,
  CalendarDays,
  LayoutTemplate,
  House,
  Workflow,
  MousePointer2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WorkspaceCard } from "@/app/app/performance/WorkspaceCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NewsletterChatStart } from "./NewsletterChatStart";
import { NewsletterTemplateStart } from "./NewsletterTemplateStart";

import { EmailReviewActions } from "./EmailReviewActions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Email = {
  id: string;
  title: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  subject: string | null;
  preheader: string | null;
  thumbnail: string | null;
  template: string;
  homeCount: number;
  ctaLabel: string | null;
  sequences: string[];
  status: string;
  updatedAt: string;
};
type ReviewFilter = "All" | "Slots" | "Drafts" | "Ready" | "Approved";
const reviewFilter = (email: Email): ReviewFilter =>
  email.status === "slot"
    ? "Slots"
    : email.status === "pending_review"
      ? "Ready"
      : email.status === "approved"
        ? "Approved"
        : "Drafts";

function MonthGroup({
  title,
  count,
  storageKey,
  children,
}: {
  title: string;
  count: number;
  storageKey: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "collapsed");
    } catch {}
  }, [storageKey]);
  return (
    <details
      open={!collapsed}
      className="group/month"
      onToggle={(event) => {
        const next = !event.currentTarget.open;
        if (next === collapsed) return;
        setCollapsed(next);
        try {
          localStorage.setItem(storageKey, next ? "collapsed" : "open");
        } catch {}
      }}
    >
      <summary className="mb-3 flex cursor-pointer list-none items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>
          {title} <span className="ml-2 text-muted-foreground">{count}</span>
        </span>
        <ChevronDown className="size-4 -rotate-90 transition-transform group-open/month:rotate-0" />
      </summary>
      <div className="grid gap-3">{children}</div>
    </details>
  );
}

export function EmailDraftsCard({
  emails,
  brandId,
  brandName,
  extraActions,
  blastsOnly = false,
}: {
  emails: Email[];
  brandId?: string;
  brandName?: string;
  extraActions?: ReactNode;
  blastsOnly?: boolean;
}) {
  const [period, setPeriod] = useState("upcoming");
  const [filter, setFilter] = useState<ReviewFilter>("All");
  const candidates = emails.filter(
    (email) =>
      !["archived", "rejected"].includes(email.status) &&
      (!blastsOnly || !email.sequences.length),
  );
  const upcoming = candidates.filter(
    (email) => !email.publishedAt && email.status !== "published",
  );
  const past = candidates.filter(
    (email) => !!email.publishedAt || email.status === "published",
  );
  const pool = period === "past" ? past : upcoming;
  const visible = pool.filter(
    (email) =>
      period === "past" || filter === "All" || reviewFilter(email) === filter,
  );
  const groups = new Map<string, { title: string; emails: Email[] }>();
  for (const email of [...visible].sort((a, b) => {
    const da = period === "past" ? a.publishedAt : a.scheduledAt;
    const db = period === "past" ? b.publishedAt : b.scheduledAt;
    if (!da) return db ? 1 : 0;
    if (!db) return -1;
    return (
      (new Date(da).getTime() - new Date(db).getTime()) *
      (period === "past" ? -1 : 1)
    );
  })) {
    const at = period === "past" ? email.publishedAt : email.scheduledAt;
    const date = at ? new Date(at) : null;
    const key = date ? `${date.getFullYear()}-${date.getMonth()}` : "undated";
    const title = date
      ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : period === "past"
        ? "Send date unavailable"
        : "Unscheduled drafts";
    const group = groups.get(key) ?? { title, emails: [] };
    group.emails.push(email);
    groups.set(key, group);
  }
  return (
    <WorkspaceCard
      title={blastsOnly ? "Blasts" : "Emails"}
      icon={Mail}
      count={candidates.length}
      actions={
        <>
          {brandId && <NewsletterTemplateStart brandId={brandId} />}
          <NewsletterChatStart brandId={brandId} brandName={brandName} />
          {extraActions}
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList aria-label="Email history">
            <TabsTrigger value="upcoming">
              Upcoming {upcoming.length}
            </TabsTrigger>
            <TabsTrigger value="past">Past {past.length}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">List</Badge>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/app/calendar?platform=newsletter&source=owned${blastsOnly ? "&kind=blast" : ""}${brandId ? `&brand=${encodeURIComponent(brandId)}` : ""}`}
            >
              Calendar
            </Link>
          </Button>
        </div>
      </div>
      {period === "upcoming" && (
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Creative review status"
        >
          {(["All", "Slots", "Drafts", "Ready", "Approved"] as const).map(
            (status) => (
              <Button
                key={status}
                size="sm"
                variant={filter === status ? "secondary" : "ghost"}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {status}{" "}
                {status === "All"
                  ? pool.length
                  : pool.filter((email) => reviewFilter(email) === status)
                      .length}
              </Button>
            ),
          )}
        </div>
      )}
      {visible.length ? (
        <div className="space-y-5">
          {[...groups].map(([key, group]) => (
            <MonthGroup
              key={`${period}-${key}`}
              title={group.title}
              count={group.emails.length}
              storageKey={`email-folders:${brandId ?? "all"}:${period}:${key}`}
            >
              {group.emails.map((email) => (
                <EmailCard key={email.id} email={email} />
              ))}
            </MonthGroup>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          icon={Mail}
          title={
            period === "past"
              ? "No sent emails yet"
              : filter === "All"
                ? "No upcoming emails"
                : `No ${filter.toLowerCase()} emails`
          }
          description={
            period === "past"
              ? "Sent blasts will appear here, grouped by send month."
              : "Start from a template, or shape an idea in chat."
          }
        />
      )}
    </WorkspaceCard>
  );
}

function EmailCard({ email }: { email: Email }) {
  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <Link
        href={`/app/newsletters/${email.id}`}
        className="group grid min-w-0 overflow-hidden text-sm transition-colors hover:border-foreground/25 hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {email.status === "pending_review"
                ? "Ready"
                : email.status === "published"
                  ? "Sent"
                  : email.status === "slot"
                    ? "Empty slot"
                    : email.status}
            </Badge>
            {email.scheduledAt &&
              !email.publishedAt &&
              new Date(email.scheduledAt).getTime() < Date.now() && (
                <Badge variant="outline">Overdue</Badge>
              )}
          </div>
          <div>
            <h3 className="line-clamp-2 text-base leading-snug font-semibold">
              {email.subject || email.title}
            </h3>
            {email.subject && email.subject !== email.title && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {email.title}
              </p>
            )}
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {email.preheader ||
                "Add a preheader to introduce this email in the inbox."}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <LayoutTemplate className="size-3.5" />
              {email.template}
            </span>
            {email.homeCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <House className="size-3.5" />
                {email.homeCount} {email.homeCount === 1 ? "home" : "homes"}
              </span>
            )}
            {email.ctaLabel && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MousePointer2 className="size-3.5 shrink-0" />
                <span className="truncate">{email.ctaLabel}</span>
              </span>
            )}
          </div>
          {email.sequences.map((sequence) => (
            <p
              key={sequence}
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <Workflow className="mt-0.5 size-3.5 shrink-0" />
              {sequence}
            </p>
          ))}
          <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs">
            {email.publishedAt ? (
              <span className="text-muted-foreground">
                Sent{" "}
                {new Date(email.publishedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            ) : email.scheduledAt ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" />
                Calendar ·{" "}
                {new Date(email.scheduledAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
                ,{" "}
                {new Date(email.scheduledAt).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Edited{" "}
                {new Date(email.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            <span className="inline-flex shrink-0 items-center gap-1 font-medium">
              Open email
              <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </div>
        </div>
        <div className="relative flex aspect-[2/1] items-center justify-center overflow-hidden border-t bg-muted/30 sm:aspect-auto sm:min-h-44 sm:border-t-0 sm:border-l">
          {email.thumbnail ? (
            <Image
              src={email.thumbnail}
              alt=""
              width={600}
              height={300}
              unoptimized
              loading="lazy"
              className="h-full w-full object-contain"
            />
          ) : (
            <div
              className="w-3/4 max-w-60 rounded-lg border bg-background p-4 shadow-sm"
              aria-hidden="true"
            >
              <Mail className="mb-3 size-5 text-muted-foreground/60" />
              <p className="line-clamp-2 text-xs font-medium">
                {email.subject || email.title}
              </p>
              <div className="mt-3 space-y-1.5">
                <div className="h-1 rounded bg-muted" />
                <div className="h-1 w-4/5 rounded bg-muted" />
                <div className="h-1 w-2/3 rounded bg-muted" />
              </div>
            </div>
          )}
          {email.thumbnail && (
            <Badge
              tone="media"
              textSize="caption"
              className="absolute right-2 bottom-2"
            >
              Image preview
            </Badge>
          )}
        </div>
      </Link>
      {["slot", "draft", "pending_review", "approved"].includes(
        email.status,
      ) && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs">
          <span className="text-muted-foreground">
            {email.status === "approved"
              ? "Creative approved"
              : email.status === "pending_review"
                ? "Ready for creative review"
                : "Creative review"}
          </span>
          <EmailReviewActions platformPostId={email.id} status={email.status} />
        </div>
      )}
    </article>
  );
}
