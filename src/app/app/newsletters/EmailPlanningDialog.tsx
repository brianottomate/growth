"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, ArrowUpRight, Mail, Check, Clock3 } from "lucide-react";
import { orpc } from "@/orpc/client";
import { SimpleDialog } from "@/components/ui/dialog";
import { DatePicker, toDateInputValue } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { resolveZonedDateTime, localEmailDate } from "@/lib/scheduling-time";
import { EmailReviewActions } from "./EmailReviewActions";
import { BroadcastScheduler } from "./BroadcastScheduler";
import type { Email } from "./EmailDraftsCard";

export function EmailPlanningDialog({
  emails,
  emailId,
  date,
  brandId,
  brandSlug,
  seriesId,
  timeZone,
  timeZoneLabel,
  onClose,
}: {
  emails: Email[];
  emailId?: string;
  date: Date;
  brandId: string;
  brandSlug?: string | null;
  seriesId?: string;
  timeZone: string;
  timeZoneLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(emailId ?? "new");
  const email = emails.find((item) => item.id === selectedId);
  const local = email?.scheduledAt
    ? localEmailDate(email.scheduledAt, timeZone)
    : null;
  const [day, setDay] = useState<Date | undefined>(date);
  const [time, setTime] = useState(
    emailId ? (local?.time ?? "10:00") : "10:00",
  );
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const update = useMutation(orpc.content.updateWorkItem.mutationOptions());
  const create = useMutation(orpc.newsletter.createSlot.mutationOptions());
  const busy = update.isPending || create.isPending;
  const queued = email?.status === "scheduled";
  const ready =
    email && ["approved", "scheduled", "published"].includes(email.status);
  const instant = () => {
    if (!day) throw new Error("Choose a calendar date.");
    return resolveZonedDateTime({
      localDateTime: `${toDateInputValue(day)}T${time}`,
      timeZone,
    });
  };
  let proposedAt: string | undefined;
  try {
    proposedAt = instant();
  } catch {
    /* Date/time can be incomplete while editing. */
  }
  const save = async () => {
    setError("");
    try {
      const plannedAt = instant();
      if (email) {
        if (!email.contentPostId)
          throw new Error("Open this email to update its date.");
        await update.mutateAsync({
          contentPostId: email.contentPostId,
          platformDrafts: [
            { platformPostId: email.id, scheduledAt: plannedAt },
          ],
        });
      } else {
        await create.mutateAsync({
          brandId,
          format: "newsletter.broadcast",
          seriesId,
          title: title.trim(),
          plannedAt,
        });
      }
      toast.success(
        email ? "Tentative date saved" : "Email added to the calendar",
      );
      router.refresh();
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not save the date.",
      );
    }
  };
  return (
    <SimpleDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={email ? "Plan email" : "Add to calendar"}
      description="Plan a date now. Creative approval and delivery are separate steps."
      size="lg"
      scrollable
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {email && (
            <EmailReviewActions
              platformPostId={email.id}
              status={email.status}
              disabled={busy}
            />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {ready && proposedAt && (
              <BroadcastScheduler
                brandId={brandId}
                brandSlug={brandSlug ?? null}
                emails={[{ ...email, scheduledAt: proposedAt }]}
                label={queued ? "Review reschedule" : "Schedule delivery"}
              />
            )}
            {!queued && (
              <Button
                disabled={busy || !day || (!email && !title.trim())}
                onClick={() => void save()}
              >
                <CalendarDays className="size-4" />
                {busy
                  ? "Saving…"
                  : email
                    ? "Save tentative date"
                    : "Create draft"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {!emailId && (
          <div className="space-y-2">
            <Label>Email</Label>
            <SimpleSelect
              aria-label="Choose email to plan"
              value={selectedId}
              onValueChange={setSelectedId}
              options={[
                { value: "new", label: "Create a new email" },
                ...emails
                  .filter(
                    (item) => !["scheduled", "published"].includes(item.status),
                  )
                  .map((item) => ({
                    value: item.id,
                    label: item.subject || item.title,
                  })),
              ]}
            />
          </div>
        )}
        {email ? (
          <div className="flex items-start gap-4 rounded-xl border bg-muted/20 p-4">
            {email.thumbnail ? (
              <img
                src={email.thumbnail}
                alt=""
                className="h-20 w-24 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-background">
                <Mail className="size-6 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 space-y-2">
              <h3 className="text-base leading-snug font-semibold">
                {email.subject || email.title}
              </h3>
              <Badge variant="secondary">
                {email.status === "pending_review"
                  ? "Ready for review"
                  : email.status === "scheduled"
                    ? "Delivery scheduled"
                    : email.status === "approved"
                      ? "Creative approved"
                      : "Draft"}
              </Badge>
              <Link
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                href={`/app/newsletters/${email.id}`}
              >
                Open email editor <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="planned-email-title">Email title</Label>
            <Input
              id="planned-email-title"
              placeholder="What’s this email about?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Calendar date</Label>
            <DatePicker
              aria-label="Tentative calendar date"
              value={day}
              onChange={setDay}
              clearable={false}
              dateFormat="EEE, MMM d, yyyy"
              className="w-full"
              density="form"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="planned-email-time">Time · {timeZoneLabel}</Label>
            <Input
              id="planned-email-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/30 p-4 text-xs">
          <div className="space-y-1.5">
            <CalendarDays className="size-4 text-muted-foreground" />
            <p className="font-medium">Calendar</p>
            <p className="text-muted-foreground">
              {queued ? "Delivery date" : "Tentative date"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Check className="size-4 text-muted-foreground" />
            <p className="font-medium">Creative</p>
            <p className="text-muted-foreground">
              {ready ? "Approved" : "Needs review"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Clock3 className="size-4 text-muted-foreground" />
            <p className="font-medium">Delivery</p>
            <p className="text-muted-foreground">
              {queued ? "Scheduled" : "Not scheduled"}
            </p>
          </div>
        </div>
        {queued && (
          <p className="text-xs text-muted-foreground">
            This email is queued. Review and approve a reschedule to change its
            delivery time.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </SimpleDialog>
  );
}
