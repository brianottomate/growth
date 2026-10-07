"use client";

import { SequenceTestPanel } from "./SequenceTestPanel";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import {
  lifecycleAttributesSchema,
  lifecycleExecutionSettingsSchema,
  type LifecycleEnrollment,
  type LifecycleCondition,
  type LifecycleExecutionSettings,
  type LifecycleExecutionSnapshot,
} from "@/lib/validators/lifecycle-runtime";

export function ConditionEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LifecycleCondition | null | undefined;
  onChange: (condition: LifecycleCondition | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange(value ? null : { field: "", operator: "eq", value: true })
          }
        >
          {value ? "Remove rule" : "Add rule"}
        </Button>
      </div>
      {value && (
        <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
          <Input
            aria-label={`${label}: attribute`}
            placeholder="Attribute, e.g. hasBooking"
            value={value.field}
            onChange={(e) => onChange({ ...value, field: e.target.value })}
          />
          <Select
            value={value.operator}
            onValueChange={(operator: LifecycleCondition["operator"]) =>
              onChange({ ...value, operator })
            }
          >
            <SelectTrigger aria-label={`${label}: comparison`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["eq", "neq", "gt", "gte", "lt", "lte", "exists"] as const).map(
                (op) => (
                  <SelectItem key={op} value={op}>
                    {
                      {
                        eq: "equals",
                        neq: "does not equal",
                        gt: "greater than",
                        gte: "at least",
                        lt: "less than",
                        lte: "at most",
                        exists: "exists (true / false)",
                      }[op]
                    }
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Input
            aria-label={`${label}: value`}
            value={String(value.value)}
            placeholder="true, false, number, or text"
            onChange={(e) => {
              const raw = e.target.value;
              const parsed =
                raw === "true"
                  ? true
                  : raw === "false"
                    ? false
                    : raw.trim() && Number.isFinite(Number(raw))
                      ? Number(raw)
                      : raw;
              onChange({ ...value, value: parsed });
            }}
          />
        </div>
      )}
    </div>
  );
}

type Review = {
  snapshot: LifecycleExecutionSnapshot;
  contentHash: string;
  errors: string[];
  variables: string[];
};
export function ExecutionPanel({
  sequenceId,
  initialSettings,
}: {
  sequenceId: string;
  initialSettings: LifecycleExecutionSettings;
}) {
  const queryClient = useQueryClient();
  const query = useQuery(
    orpc.emailSequence.executionOverview.queryOptions({
      input: { sequenceId },
    }),
  );
  const [draft, setDraft] = useState<LifecycleExecutionSettings | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [activationRevisionId, setActivationRevisionId] = useState<
    string | null
  >(null);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [attributes, setAttributes] = useState("{}");
  const [confirmEnrollment, setConfirmEnrollment] = useState(false);
  const [enrollmentAttempt, setEnrollmentAttempt] =
    useState<LifecycleEnrollment | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const data = query.data;
  const settings = draft ?? initialSettings;
  const change = (next: LifecycleExecutionSettings) => {
    setDraft(next);
    setReview(null);
  };
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.emailSequence.executionOverview.key(),
    });
  const onError = (error: Error) => toast.error(error.message);
  const preview = useMutation(
    orpc.emailSequence.previewExecution.mutationOptions({
      onSuccess: setReview,
      onError,
    }),
  );
  const prepare = useMutation(
    orpc.emailSequence.prepareExecution.mutationOptions({
      onSuccess: () => {
        void refresh();
        setReview(null);
        setDraft(null);
        toast.success("Reviewed version saved. Delivery remains paused.");
      },
      onError,
    }),
  );
  const toggle = useMutation(
    orpc.emailSequence.setExecutionEnabled.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast.success("Execution setting updated");
      },
      onError,
    }),
  );
  const rotate = useMutation(
    orpc.emailSequence.rotateIngestToken.mutationOptions({
      onSuccess: ({ token: newToken }) => {
        setToken(newToken);
        void refresh();
      },
      onError,
    }),
  );
  const enroll = useMutation(
    orpc.emailSequence.enrollRecipient.mutationOptions({
      onSuccess: (result) => {
        void refresh();
        if (result.queued) {
          toast.success("Recipient enrolled");
          setEnrollmentAttempt(null);
          setEmail("");
        } else
          toast.error(
            "Enrollment saved, but scheduling failed. Use Recover queued work.",
          );
      },
      onError,
    }),
  );
  const recover = useMutation(
    orpc.emailSequence.recoverExecution.mutationOptions({
      onSuccess: (result) => {
        setNextCursor(result.nextCursor);
        void refresh();
        toast.success(
          `Processed ${result.queued} enrollments; ${result.failed} need another retry.${result.nextCursor ? " Continue with the next batch." : ""}`,
        );
      },
      onError,
    }),
  );
  const cancel = useMutation(
    orpc.emailSequence.cancelEnrollment.mutationOptions({
      onSuccess: () => {
        void refresh();
      },
      onError,
    }),
  );

  if (query.isPending)
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Loading email execution…
      </p>
    );
  if (query.isError)
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Email execution unavailable</CardTitle>
          <CardDescription>{query.error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  if (!data) return null;
  const busy = prepare.isPending || toggle.isPending || preview.isPending;
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Email execution</CardTitle>
          <Badge variant={data.enabled ? "default" : "secondary"}>
            {data.enabled
              ? "Active"
              : data.revision
                ? "Prepared · paused"
                : "Planning only"}
          </Badge>
        </div>
        <CardDescription>
          Turn reviewed email steps into a scheduled journey. Saved versions
          preserve copy and timing; recipient rules use the latest profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SequenceTestPanel
          sequenceId={sequenceId}
          ready={data.readiness.ready}
          onStarted={refresh}
        />
        <p className="text-sm text-muted-foreground">
          Delivery uses this brand’s Postmark server and message stream:{" "}
          {data.brandDelivery
            ? `${data.brandDelivery.serverId} / ${data.brandDelivery.messageStream}`
            : "configure email delivery in brand settings"}
          .
        </p>
        {!data.readiness.ready && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              You can prepare journeys before connecting delivery.
            </p>
            <p className="mt-1 text-muted-foreground">
              Setup remaining: {data.readiness.missing.join(", ")}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lifecycle-from">Sender</Label>
            <Input
              id="lifecycle-from"
              placeholder="Wander <hello@example.com>"
              value={settings.from}
              onChange={(e) => change({ ...settings, from: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lifecycle-reply">Reply-to (optional)</Label>
            <Input
              id="lifecycle-reply"
              placeholder="team@example.com"
              value={settings.replyTo ?? ""}
              onChange={(e) =>
                change({ ...settings, replyTo: e.target.value || undefined })
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              const parsed =
                lifecycleExecutionSettingsSchema.safeParse(settings);
              if (!parsed.success) {
                toast.error(
                  parsed.error.issues[0]?.message ??
                    "Check the journey settings",
                );
                return;
              }
              preview.mutate({ sequenceId, settings: parsed.data });
            }}
          >
            {preview.isPending ? "Reviewing…" : "Review execution version"}
          </Button>
          {data.enabled ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => toggle.mutate({ sequenceId, enabled: false })}
            >
              Pause delivery
            </Button>
          ) : (
            <Button
              disabled={!data.revision || !data.readiness.ready || busy}
              onClick={() => setActivationRevisionId(data.revision!.id)}
            >
              Activate reviewed version
            </Button>
          )}
          <Button
            variant="outline"
            disabled={
              !data.enabled || !data.readiness.ready || recover.isPending
            }
            onClick={() =>
              recover.mutate({
                sequenceId,
                ...(nextCursor ? { afterId: nextCursor } : {}),
                confirmSends: true,
              })
            }
          >
            {nextCursor ? "Recover next batch" : "Recover queued work"}
          </Button>
        </div>
        {data.revision && (
          <p className="text-xs text-muted-foreground">
            Prepared {new Date(data.revision.createdAt).toLocaleString()} ·{" "}
            {data.revision.snapshot.steps.length} emails. Existing enrollments
            retain their original version. Resume uses original due dates, so
            overdue emails may send immediately. A send already in progress can
            finish after pausing.
          </p>
        )}
        {data.revision && (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Saved delivery version · {data.revision.id}
            </summary>
            <p className="mt-3 text-sm">
              From {data.revision.snapshot.settings.from} · Event{" "}
              {data.revision.snapshot.settings.triggerEvent}
            </p>
            {data.revision.snapshot.steps.map((step) => (
              <details key={step.id} className="mt-3 border-t pt-3">
                <summary className="cursor-pointer text-sm">
                  {step.name} · {step.subject} · planned +{step.delayMinutes}{" "}
                  min
                </summary>
                <iframe
                  title={`Saved preview ${step.name}`}
                  sandbox=""
                  srcDoc={step.renderedHtml}
                  className="mt-2 h-96 w-full rounded-md border bg-white"
                />
              </details>
            ))}
          </details>
        )}
        {review && (
          <div className="space-y-3 rounded-md border p-4">
            <h3 className="font-medium">Review this version</h3>
            {review.errors.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {review.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            )}
            <p className="text-sm">
              Sender: {review.snapshot.settings.from} · Event:{" "}
              {review.snapshot.settings.triggerEvent}
            </p>
            <p className="text-sm">
              Postmark destination:{" "}
              {review.snapshot.delivery
                ? `${review.snapshot.delivery.serverId} / ${review.snapshot.delivery.messageStream}`
                : "not configured — prepare again after connecting the brand"}
            </p>
            <p className="text-sm text-muted-foreground">
              Postal address:{" "}
              {review.snapshot.postalAddress ?? "not configured"}
            </p>
            <p className="text-sm text-muted-foreground">
              Personalization fields:{" "}
              {review.variables.filter((v) => v !== "email").join(", ") ||
                "none"}
              . Empty guest fields use the email’s fallback.
            </p>
            {review.snapshot.settings.exitCondition && (
              <p className="text-sm">
                Stop when: {review.snapshot.settings.exitCondition.field}{" "}
                {review.snapshot.settings.exitCondition.operator}{" "}
                {JSON.stringify(review.snapshot.settings.exitCondition.value)}
              </p>
            )}
            {review.snapshot.steps.map((step) => (
              <div key={step.id} className="space-y-1 border-t pt-3">
                <p className="font-medium">
                  {step.name} · +{step.delayMinutes} minutes
                </p>
                {step.condition && (
                  <p className="text-xs text-muted-foreground">
                    Send when: {step.condition.field} {step.condition.operator}{" "}
                    {JSON.stringify(step.condition.value)}
                  </p>
                )}
                {step.parentStepId && (
                  <p className="text-xs text-muted-foreground">
                    Requires parent step to have sent:{" "}
                    {
                      review.snapshot.steps.find(
                        (s) => s.id === step.parentStepId,
                      )?.name
                    }
                  </p>
                )}
                <p className="text-sm">{step.subject}</p>
                <iframe
                  title={`Preview ${step.name}`}
                  sandbox=""
                  srcDoc={step.renderedHtml}
                  className="h-96 w-full rounded-md border bg-white"
                />
              </div>
            ))}
            <Button
              disabled={
                Boolean(review.errors.length) ||
                prepare.isPending ||
                data.enabled
              }
              onClick={() =>
                prepare.mutate({
                  sequenceId,
                  settings: review.snapshot.settings,
                  reviewedHash: review.contentHash,
                })
              }
            >
              Save reviewed version
            </Button>
            {data.enabled && (
              <p className="text-sm text-muted-foreground">
                Pause delivery before saving a new version.
              </p>
            )}
          </div>
        )}
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Connect product events
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <p>
              POST to <code>/api/email-sequences/{sequenceId}</code> with a
              sequence-specific Bearer token. Enrollment events need an event
              ID, the reviewed event name, an email, attributes, and recorded
              consent. Profile events update existing recipients across this
              brand.
            </p>
            <Button
              variant="outline"
              disabled={rotate.isPending}
              onClick={() => rotate.mutate({ sequenceId })}
            >
              {data.hasIngestToken
                ? "Replace integration token"
                : "Create integration token"}
            </Button>
            {data.hasIngestToken && (
              <p className="text-muted-foreground">
                Replacing the token immediately revokes the previous token.
              </p>
            )}
            {token && (
              <div className="space-y-2">
                <Label htmlFor="lifecycle-token">
                  Copy this token now; it is shown only here
                </Label>
                <Input id="lifecycle-token" readOnly value={token} />
                <Button variant="ghost" onClick={() => setToken(null)}>
                  Hide token
                </Button>
              </div>
            )}
            <p className="text-muted-foreground">
              Delivery callback: /api/jobs/lifecycle. Configure Postmark
              delivery, bounce, complaint and failure webhooks at
              /api/webhooks/postmark.
            </p>
          </div>
        </details>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Enroll one recipient
          </summary>
          <div className="mt-3 space-y-3">
            <Label htmlFor="lifecycle-recipient">Recipient email</Label>
            <Input
              id="lifecycle-recipient"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Label htmlFor="lifecycle-consent">Consent source</Label>
            <Input
              id="lifecycle-consent"
              placeholder="Where this recipient agreed to lifecycle email"
              value={consentSource}
              onChange={(e) => setConsentSource(e.target.value)}
            />
            <Label htmlFor="lifecycle-attributes">
              Recipient attributes (JSON)
            </Label>
            <Textarea
              id="lifecycle-attributes"
              value={attributes}
              onChange={(e) => setAttributes(e.target.value)}
            />
            <Button
              disabled={
                !data.enabled ||
                !data.readiness.ready ||
                !email ||
                !consentSource ||
                enroll.isPending
              }
              onClick={() => setConfirmEnrollment(true)}
            >
              Review enrollment
            </Button>
          </div>
        </details>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Recent enrollments</h3>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
          {!data.runs.length && (
            <p className="text-sm text-muted-foreground">
              No recipients enrolled. Preparing a version sends nothing.
            </p>
          )}
          {data.runs.map((run) => (
            <details key={run.id} className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm">
                {run.isTest ? "Test · " : ""}
                {run.email} · {run.status} ·{" "}
                {new Date(run.createdAt).toLocaleString()}
              </summary>
              <div className="mt-3 space-y-2">
                {run.reason && (
                  <p className="text-sm text-muted-foreground">{run.reason}</p>
                )}
                {data.deliveries
                  .filter((d) => d.enrollmentId === run.id)
                  .map((delivery) => (
                    <div key={delivery.id} className="text-sm">
                      <span>
                        {delivery.stepName} · {delivery.status} ·{" "}
                        {new Date(delivery.dueAt).toLocaleString()}
                      </span>
                      {delivery.providerStatus && (
                        <span> · {delivery.providerStatus}</span>
                      )}
                      {delivery.lastError && (
                        <p className="text-muted-foreground">
                          {delivery.lastError}
                        </p>
                      )}
                    </div>
                  ))}
                {(["active", "needs_review"] as string[]).includes(
                  run.status,
                ) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() =>
                      cancel.mutate({ sequenceId, enrollmentId: run.id })
                    }
                  >
                    Cancel remaining emails
                  </Button>
                )}
              </div>
            </details>
          ))}
          {data.runs.length === 50 && (
            <p className="text-xs text-muted-foreground">
              Showing the 50 most recent enrollments.
            </p>
          )}
        </div>
      </CardContent>
      <AlertDialog
        open={Boolean(activationRevisionId)}
        onOpenChange={(open) => {
          if (!open) setActivationRevisionId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate this email sequence?</AlertDialogTitle>
            <AlertDialogDescription>
              Version prepared{" "}
              {data.revision
                ? new Date(data.revision.createdAt).toLocaleString()
                : ""}
              : {data.revision?.snapshot.steps.length} emails from{" "}
              {data.revision?.snapshot.settings.from}, triggered by{" "}
              {data.revision?.snapshot.settings.triggerEvent}. This allows new
              enrollment events to schedule real emails from the reviewed
              version. Existing active enrollments can resume using their saved
              versions. Use Recover queued work after activation to schedule
              paused work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep paused</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                activationRevisionId !== data.revision?.id || toggle.isPending
              }
              onClick={() =>
                toggle.mutate({
                  sequenceId,
                  enabled: true,
                  expectedRevisionId: activationRevisionId!,
                  confirmSends: true,
                })
              }
            >
              Activate delivery
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmEnrollment} onOpenChange={setConfirmEnrollment}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enroll {email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This schedules real emails. Confirm that this recipient has agreed
              to lifecycle emails from this brand. Consent source:{" "}
              {consentSource}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                try {
                  const parsedAttributes = lifecycleAttributesSchema.parse(
                    JSON.parse(attributes),
                  );
                  const candidate: LifecycleEnrollment = {
                    email,
                    eventId: crypto.randomUUID(),
                    eventName: data.revision!.snapshot.settings.triggerEvent,
                    attributes: parsedAttributes,
                    consent: {
                      granted: true,
                      source: consentSource,
                      recordedAt: new Date().toISOString(),
                    },
                  };
                  // Preserve the exact input when a response is lost or scheduling needs a retry.
                  const same =
                    enrollmentAttempt &&
                    enrollmentAttempt.email === candidate.email &&
                    enrollmentAttempt.eventName === candidate.eventName &&
                    enrollmentAttempt.consent.source ===
                      candidate.consent.source &&
                    JSON.stringify(enrollmentAttempt.attributes) ===
                      JSON.stringify(candidate.attributes);
                  const enrollment = same ? enrollmentAttempt : candidate;
                  setEnrollmentAttempt(enrollment);
                  enroll.mutate({ sequenceId, confirmSends: true, enrollment });
                } catch {
                  toast.error(
                    "Attributes must be a JSON object with text, number, boolean, or null values.",
                  );
                }
              }}
            >
              Confirm consent and enroll
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
