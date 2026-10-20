"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronLeft,
  Check,
  Mail,
  ArrowRight,
} from "lucide-react";
import { orpc, type RouterOutputs } from "@/orpc/client";
import { resolveZonedDateTime, localEmailDate } from "@/lib/scheduling-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleSelect } from "@/components/ui/select";
import { SimpleDialog } from "@/components/ui/dialog";
import {
  DatePicker,
  fromDateInputValue,
  toDateInputValue,
} from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";

type Review = RouterOutputs["newsletter"]["previewBroadcasts"];
type Email = {
  id: string;
  title: string;
  subject?: string | null;
  thumbnail?: string | null;
  status: string;
  scheduledAt?: string | null;
};
const ZONES = [
  { value: "America/New_York", label: "Eastern time" },
  { value: "America/Chicago", label: "Central time" },
  { value: "America/Denver", label: "Mountain time" },
  { value: "America/Los_Angeles", label: "Pacific time" },
  { value: "Europe/London", label: "London time" },
  { value: "UTC", label: "UTC" },
];

export function BroadcastScheduler({
  brandId,
  brandSlug,
  emails,
  label = "Schedule delivery",
}: {
  brandId: string;
  brandSlug: string | null;
  emails: Email[];
  label?: string;
}) {
  const router = useRouter();
  const eligible = emails.filter((email) =>
    ["approved", "scheduled"].includes(email.status),
  );
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [timeZone, setTimeZone] = useState(
    brandSlug === "winter-park-escapes"
      ? "America/Denver"
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [selectedAudienceId, setSelectedAudienceId] = useState("");
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [customerIoStopped, setCustomerIoStopped] = useState(false);
  const audiences = useQuery({
    ...orpc.newsletter.sendAudiences.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const usableAudiences =
    audiences.data?.filter((audience) => audience.consentConfirmed) ?? [];
  const audienceId =
    selectedAudienceId ||
    (usableAudiences.length === 1 ? usableAudiences[0]!.id : "");
  const prepare = useMutation(
    orpc.newsletter.prepareBroadcast.mutationOptions(),
  );
  const preview = useMutation(
    orpc.newsletter.previewBroadcasts.mutationOptions(),
  );
  const schedule = useMutation(
    orpc.newsletter.scheduleBroadcasts.mutationOptions(),
  );
  const [prepared, setPrepared] = useState<
    Array<{ messageSendId: string; scheduledAt: string }>
  >([]);
  const selectedEmails = eligible.filter((email) =>
    selected.includes(email.id),
  );
  const currentPreview = review?.sends[previewIndex];
  const zoneLabel =
    ZONES.find((zone) => zone.value === timeZone)?.label ??
    timeZone.replaceAll("_", " ");
  const openDialog = () => {
    const initial: Record<string, string> = {};
    for (const email of eligible)
      if (email.scheduledAt) {
        const local = localEmailDate(email.scheduledAt, timeZone);
        initial[email.id] = `${local.day}T${local.time}`;
      }
    setDates(initial);
    setSelected(eligible.map((email) => email.id));
    setReview(undefined);
    setCustomerIoStopped(false);
    setError("");
    setOpen(true);
  };
  const reviewSchedule = async () => {
    setBusy(true);
    setError("");
    try {
      const sends = [];
      for (const email of selectedEmails) {
        const localDateTime = dates[email.id];
        if (!localDateTime)
          throw new Error(
            `Choose a date for “${email.subject || email.title}”.`,
          );
        const scheduledAt = resolveZonedDateTime({ localDateTime, timeZone });
        const send = await prepare.mutateAsync({
          platformPostId: email.id,
          audienceId,
        });
        sends.push({ messageSendId: send.id, scheduledAt });
      }
      setPrepared(sends);
      setReview(await preview.mutateAsync({ brandId, timeZone, sends }));
      setPreviewIndex(0);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not prepare the schedule.",
      );
    } finally {
      setBusy(false);
    }
  };
  const approveSchedule = async () => {
    if (!review) return;
    setError("");
    try {
      const result = await schedule.mutateAsync({
        brandId,
        timeZone,
        sends: prepared,
        reviewedHash: review.reviewedHash,
        customerIoStopped: true,
      });
      const failed = result.sends.filter((send) => !send.queued).length;
      if (failed) {
        setError(`${failed} schedules were saved but need queue recovery.`);
        router.refresh();
        return;
      }
      toast.success(
        `${result.sends.length} ${result.sends.length === 1 ? "email" : "emails"} scheduled`,
      );
      setOpen(false);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not queue the schedule.",
      );
    }
  };
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!eligible.length}
        title={
          !eligible.length
            ? "Approve an email’s creative before scheduling delivery"
            : undefined
        }
        onClick={openDialog}
      >
        <CalendarClock className="size-4" />
        {label}
      </Button>
      <SimpleDialog
        open={open}
        onOpenChange={(next) => {
          if (!busy && !schedule.isPending) setOpen(next);
        }}
        title={review ? "Review delivery" : "Schedule delivery"}
        description={
          review
            ? "Confirm the emails, audience and send times before they enter the queue."
            : "Choose approved emails to send. Calendar plans stay tentative until you confirm delivery."
        }
        size={review ? "xl" : "lg"}
        scrollable
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            {review ? (
              <Button
                variant="ghost"
                disabled={schedule.isPending}
                onClick={() => {
                  setReview(undefined);
                }}
              >
                <ChevronLeft className="size-4" />
                Edit schedule
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {selectedEmails.length}{" "}
                {selectedEmails.length === 1 ? "email" : "emails"} · {zoneLabel}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy || schedule.isPending}
              >
                Cancel
              </Button>
              {review ? (
                <Button
                  disabled={
                    !review.readiness.ready ||
                    !customerIoStopped ||
                    schedule.isPending
                  }
                  onClick={() => void approveSchedule()}
                >
                  <Check className="size-4" />
                  {schedule.isPending
                    ? "Scheduling…"
                    : `Confirm ${review.sends.length === 1 ? "delivery" : `${review.sends.length} sends`}`}
                </Button>
              ) : (
                <Button
                  disabled={busy || !audienceId || !selectedEmails.length}
                  onClick={() => void reviewSchedule()}
                >
                  {busy ? "Preparing review…" : "Review delivery"}
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        }
      >
        {!review ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-2">
                <Label>Audience</Label>
                <SimpleSelect
                  aria-label="Delivery audience"
                  value={audienceId}
                  placeholder={
                    audiences.isPending
                      ? "Loading audiences…"
                      : "Choose an audience"
                  }
                  onValueChange={setSelectedAudienceId}
                  options={usableAudiences.map((audience) => ({
                    value: audience.id,
                    label: `${audience.name} · ${audience.recipientCount === null ? "Live audience" : `${audience.recipientCount.toLocaleString()} people`}`,
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Time zone</Label>
                <SimpleSelect
                  aria-label="Delivery time zone"
                  value={timeZone}
                  onValueChange={setTimeZone}
                  options={
                    ZONES.some((zone) => zone.value === timeZone)
                      ? ZONES
                      : [...ZONES, { value: timeZone, label: zoneLabel }]
                  }
                />
              </div>
            </div>
            {audiences.error && (
              <p role="alert" className="text-sm text-destructive">
                {audiences.error.message}
              </p>
            )}
            {!audiences.isPending && !usableAudiences.length && (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Choose a consent-confirmed audience in the Audiences tab before
                scheduling delivery.
              </p>
            )}
            <div className="divide-y rounded-xl border">
              {eligible.map((email) => {
                const value = dates[email.id] ?? "";
                const [day, time = "10:00"] = value.split("T");
                return (
                  <div key={email.id} className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`delivery-${email.id}`}
                        checked={selected.includes(email.id)}
                        onCheckedChange={(checked) =>
                          setSelected(
                            checked
                              ? [...selected, email.id]
                              : selected.filter((id) => id !== email.id),
                          )
                        }
                      />
                      {email.thumbnail ? (
                        <img
                          src={email.thumbnail}
                          alt=""
                          className="size-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Mail className="size-4 text-muted-foreground" />
                        </span>
                      )}
                      <Label htmlFor={`delivery-${email.id}`}>
                        <span className="line-clamp-2 leading-snug">
                          {email.subject || email.title}
                        </span>
                      </Label>
                    </div>
                    {selected.includes(email.id) && (
                      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 pl-7">
                        <DatePicker
                          aria-label={`Send date for ${email.subject || email.title}`}
                          value={fromDateInputValue(day ?? "")}
                          clearable={false}
                          dateFormat="EEE, MMM d"
                          onChange={(date) =>
                            setDates({
                              ...dates,
                              [email.id]: date
                                ? `${toDateInputValue(date)}T${time}`
                                : "",
                            })
                          }
                          className="w-full"
                          density="form"
                        />
                        <Input
                          type="time"
                          aria-label={`Send time for ${email.subject || email.title}`}
                          value={time}
                          onChange={(event) =>
                            setDates({
                              ...dates,
                              [email.id]: `${day || toDateInputValue(new Date())}T${event.target.value}`,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Sending to</p>
                <p className="mt-1 font-medium">
                  {review.sends[0]?.audience.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  From {review.sends[0]?.sender?.fromEmail}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {review.sends[0]?.recipientCount?.toLocaleString() ??
                    "Calculated at send time"}{" "}
                  current recipients.
                  {" Membership is read when delivery starts."}
                </p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Delivery</p>
                <p className="mt-1 font-medium">
                  {review.sends.length}{" "}
                  {review.sends.length === 1 ? "email" : "emails"} · {zoneLabel}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {review.sends[0]?.localTime}
                </p>
              </div>
            </div>
            <SimpleSelect
              aria-label="Email preview"
              value={String(previewIndex)}
              onValueChange={(value) => setPreviewIndex(Number(value))}
              options={review.sends.map((send, index) => ({
                value: String(index),
                label: `${index + 1}. ${send.subject} · ${send.localTime}`,
              }))}
            />
            {currentPreview && (
              <iframe
                title={`Delivery preview: ${currentPreview.subject}`}
                sandbox=""
                srcDoc={currentPreview.html}
                className="h-96 w-full rounded-xl border bg-background"
              />
            )}
            {!review.readiness.ready && (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Delivery setup needs to be completed before this schedule can be
                activated.
              </p>
            )}
            <div className="flex items-start gap-3 rounded-xl border p-4">
              <Checkbox
                id="customer-io-stopped"
                checked={customerIoStopped}
                onCheckedChange={(checked) =>
                  setCustomerIoStopped(checked === true)
                }
              />
              <Label htmlFor="customer-io-stopped">
                I confirmed this brand’s conflicting Customer.io sends are
                stopped before Growth queues these emails.
              </Label>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </SimpleDialog>
    </>
  );
}
