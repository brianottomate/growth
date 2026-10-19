"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import { resolveZonedDateTime, localEmailDate } from "@/lib/scheduling-time";
import { fromDateInputValue } from "@/components/ui/date-picker";
import { EmailPlanningDialog } from "./EmailPlanningDialog";
import { BroadcastScheduler } from "./BroadcastScheduler";
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
import { EmptyState } from "@/components/ui/empty-state";
import { NewsletterChatStart } from "./NewsletterChatStart";
import { NewsletterTemplateStart } from "./NewsletterTemplateStart";

import { EmailCalendar } from "./EmailCalendar";
import { EmailReviewActions } from "./EmailReviewActions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type Email = {
  id: string;
  contentPostId: string | null;
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
const EMAIL_STAGES = [
  "Drafts",
  "Ready",
  "Approved",
  "Scheduled",
  "Sent",
] as const;
type EmailStage = (typeof EMAIL_STAGES)[number];
type StageFilter = "All" | EmailStage;

function emailStage(email: Email): EmailStage {
  if (email.publishedAt || email.status === "published") return "Sent";
  // A calendar date alone is an editorial plan, not a scheduled delivery.
  if (email.status === "scheduled") return "Scheduled";
  if (email.status === "pending_review") return "Ready";
  if (email.status === "approved") return "Approved";
  return "Drafts";
}

const emailDate = (email: Email) =>
  emailStage(email) === "Sent" ? email.publishedAt : email.scheduledAt;

function MonthGroup({
  title,
  count,
  storageKey,
  children,
  defaultCollapsed = false,
}: {
  title: string;
  count: number;
  storageKey: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setCollapsed(saved === null ? defaultCollapsed : saved === "collapsed");
    } catch {}
  }, [storageKey, defaultCollapsed]);
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
  title,
  actions,
  intro,
  titleAccessory,
  brandSlug,
  seriesId,
  calendarFirst = false,
}: {
  emails: Email[];
  brandId?: string;
  brandName?: string;
  extraActions?: ReactNode;
  blastsOnly?: boolean;
  title?: string;
  actions?: ReactNode;
  intro?: ReactNode;
  titleAccessory?: ReactNode;
  brandSlug?: string | null;
  seriesId?: string;
  calendarFirst?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">(
    calendarFirst ? "calendar" : "list",
  );
  const [planning, setPlanning] = useState<{
    emailId?: string;
    date: Date;
  } | null>(null);
  const timeZone =
    brandSlug === "winter-park-escapes"
      ? "America/Denver"
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneLabel =
    timeZone === "America/Denver"
      ? "Mountain time"
      : (timeZone.replaceAll("_", " ").split("/").pop() ?? "Local time");
  const move = useMutation(
    orpc.content.updateWorkItem.mutationOptions({
      onSuccess: () => {
        router.refresh();
        toast.success("Tentative date updated");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const [filter, setFilter] = useState<StageFilter>("All");
  const candidates = emails.filter(
    (email) =>
      !["archived", "rejected"].includes(email.status) &&
      (!blastsOnly || !email.sequences.length),
  );
  const visible = candidates.filter(
    (email) => filter === "All" || emailStage(email) === filter,
  );
  const groups = new Map<string, { title: string; emails: Email[] }>();
  for (const email of [...visible].sort((a, b) => {
    const da = emailDate(a);
    const db = emailDate(b);
    if (!da) return db ? 1 : 0;
    if (!db) return -1;
    return (
      (new Date(da).getTime() - new Date(db).getTime()) *
      (filter === "Sent" ? -1 : 1)
    );
  })) {
    const at = emailDate(email);
    const date = at ? new Date(at) : null;
    const key = date ? `${date.getFullYear()}-${date.getMonth()}` : "undated";
    const title = date
      ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : filter === "Sent"
        ? "Send date unavailable"
        : "Not on calendar";
    const group = groups.get(key) ?? { title, emails: [] };
    group.emails.push(email);
    groups.set(key, group);
  }
  return (
    <WorkspaceCard
      title={title ?? (blastsOnly ? "Broadcasts" : "Emails")}
      icon={Mail}
      count={candidates.length}
      titleAccessory={titleAccessory}
      actions={
        <>
          {actions ?? (
            <>
              {brandId && <NewsletterTemplateStart brandId={brandId} />}
              <NewsletterChatStart brandId={brandId} brandName={brandName} />
              {extraActions}
            </>
          )}
          {brandId && calendarFirst && (
            <BroadcastScheduler
              brandId={brandId}
              brandSlug={brandSlug ?? null}
              emails={candidates}
            />
          )}
        </>
      }
    >
      {intro}
      {planning && brandId && (
        <EmailPlanningDialog
          key={`${planning.emailId ?? "new"}:${planning.date.toISOString()}`}
          emails={candidates}
          emailId={planning.emailId}
          date={planning.date}
          brandId={brandId}
          brandSlug={brandSlug}
          seriesId={seriesId}
          timeZone={timeZone}
          timeZoneLabel={timeZoneLabel}
          onClose={() => setPlanning(null)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as StageFilter)}
          className="min-w-0 basis-full @xl:flex-1 @xl:basis-0"
        >
          <TabsList
            aria-label="Email stage"
            className="h-auto max-w-full justify-start overflow-x-auto"
          >
            {(["All", ...EMAIL_STAGES] as const).map((stage) => (
              <TabsTrigger key={stage} value={stage} className="shrink-0">
                {stage}{" "}
                {stage === "All"
                  ? candidates.length
                  : candidates.filter((email) => emailStage(email) === stage)
                      .length}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as "list" | "calendar")}
        >
          <TabsList aria-label="Email view">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {view === "calendar" && (
        <EmailCalendar
          timeZone={calendarFirst ? timeZone : undefined}
          timeZoneLabel={calendarFirst ? timeZoneLabel : undefined}
          onPlan={
            calendarFirst && brandId
              ? (date) => setPlanning({ date })
              : undefined
          }
          onOpen={
            calendarFirst && brandId
              ? (id) => {
                  const email = candidates.find((item) => item.id === id);
                  if (!email) return;
                  if (email.publishedAt || email.status === "published") {
                    router.push(`/app/newsletters/${email.id}`);
                    return;
                  }
                  const local = email.scheduledAt
                    ? localEmailDate(email.scheduledAt, timeZone)
                    : null;
                  setPlanning({
                    emailId: id,
                    date: local ? fromDateInputValue(local.day)! : new Date(),
                  });
                }
              : undefined
          }
          onMove={
            calendarFirst && brandId
              ? (id, day) => {
                  const email = candidates.find((item) => item.id === id);
                  if (!email?.contentPostId || !email.scheduledAt) return;
                  const local = localEmailDate(email.scheduledAt, timeZone);
                  try {
                    move.mutate({
                      contentPostId: email.contentPostId,
                      platformDrafts: [
                        {
                          platformPostId: id,
                          scheduledAt: resolveZonedDateTime({
                            localDateTime: `${day}T${local.time}`,
                            timeZone,
                          }),
                        },
                      ],
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not move the date.",
                    );
                  }
                }
              : undefined
          }
          entries={visible.flatMap((email) => {
            const at = emailDate(email);
            return at
              ? [
                  {
                    id: email.id,
                    title: email.subject ?? email.title,
                    thumbnail: email.thumbnail,
                    stage: emailStage(email),
                    at,
                  },
                ]
              : [];
          })}
          renderEmail={(id) => {
            const email = visible.find((email) => email.id === id);
            return email ? <EmailCard key={id} email={email} /> : null;
          }}
        />
      )}
      {visible.length ? (
        <div className="space-y-5">
          {[...groups]
            .filter(([key]) => view === "list" || key === "undated")
            .map(([key, group]) => (
              <MonthGroup
                key={`${filter}-${key}`}
                defaultCollapsed={key === "undated"}
                title={group.title}
                count={group.emails.length}
                storageKey={`email-folders:${brandId ?? "all"}:${key === "undated" ? key : `${filter}:${key}`}`}
              >
                {group.emails.map((email) => (
                  <EmailCard key={email.id} email={email} />
                ))}
              </MonthGroup>
            ))}
        </div>
      ) : view === "list" ? (
        <EmptyState
          compact
          icon={Mail}
          title={
            filter === "Sent"
              ? "No sent emails yet"
              : filter === "All"
                ? "No emails yet"
                : `No ${filter.toLowerCase()} emails`
          }
          description={
            filter === "Sent"
              ? "Sent blasts will appear here, grouped by send month."
              : "Start from a template, or shape an idea in chat."
          }
        />
      ) : null}
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
                    ? "Draft"
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
