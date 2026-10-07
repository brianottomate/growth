"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  emailSequenceDraftSchema,
  type EmailSequenceDraft,
} from "@/lib/validators/email-sequence";
import { ExecutionPanel, ConditionEditor } from "./ExecutionPanel";

function SequenceChatStart({
  brandId,
  sequenceId,
  disabled = false,
}: {
  brandId: string;
  sequenceId?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      title={
        disabled
          ? "Save your draft before working in chat"
          : "Plan or manage this sequence in chat"
      }
      onClick={() =>
        sendAssistantIntent({
          type: "work_email_sequence",
          newThread: true,
          brandId,
          sequenceId,
          visibleText: sequenceId
            ? "Help me shape this email sequence. Read its saved plan and delivery status, then talk through what we should change."
            : "Help me plan an email sequence. Let's work out the entry event, emails, waits and exit rule before saving a draft.",
        })
      }
    >
      <MessageSquare className="size-4" /> Shape
    </Button>
  );
}

function duration(minutes: number) {
  if (!minutes) return "Immediately";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    mins ? `${mins}m` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
function WaitInput({
  minutes,
  onChange,
  label,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  label: string;
}) {
  const [unit, setUnit] = useState(
    minutes > 0 && minutes % 1440 === 0
      ? "1440"
      : minutes > 0 && minutes % 60 === 0
        ? "60"
        : "1",
  );
  return (
    <>
      <Input
        type="number"
        min={0}
        max={525600 / Number(unit)}
        step={1}
        className="w-24"
        aria-label={label}
        value={minutes / Number(unit)}
        onChange={(e) =>
          onChange(Math.round(Number(e.target.value) * Number(unit)))
        }
      />
      <Select value={unit} onValueChange={setUnit}>
        <SelectTrigger className="w-28" aria-label={`${label} unit`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">minutes</SelectItem>
          <SelectItem value="60">hours</SelectItem>
          <SelectItem value="1440">days</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}
const emptyDraft = (): EmailSequenceDraft => ({
  name: "Welcome",
  description: "",
  triggerEvent: "guest.subscribed",
  exitCondition: null,
  steps: [],
});

function isWelcomeSequence(triggerEvent: string) {
  return (
    triggerEvent.trim().toLowerCase().replaceAll("_", ".") ===
    "guest.subscribed"
  );
}

export function EmailSequences({
  brandId,
  basePath,
  sequenceId,
}: {
  brandId: string;
  basePath: string;
  sequenceId?: string;
}) {
  const router = useRouter();
  const createFlex = useMutation(
    orpc.emailSequence.createFlexTest.mutationOptions({
      onSuccess: ({ id }) =>
        router.push(`${basePath}?tab=sequences&sequence=${id}`),
      onError: (error) => toast.error(error.message),
    }),
  );
  const query = useQuery(
    orpc.emailSequence.list.queryOptions({ input: { brandId } }),
  );
  if (sequenceId)
    return (
      <SequenceLoader
        key={sequenceId}
        brandId={brandId}
        basePath={basePath}
        sequenceId={sequenceId}
      />
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Email sequences</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with a welcome series for new subscribers. Other lifecycle
            journeys are coming later.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SequenceChatStart brandId={brandId} />
          <Button
            variant="outline"
            disabled={createFlex.isPending}
            onClick={() => createFlex.mutate({ brandId })}
          >
            Flex test sequence
          </Button>
          <Button asChild>
            <Link href={`${basePath}?tab=sequences&sequence=new`}>
              <Plus className="size-4" />
              New welcome sequence
            </Link>
          </Button>
        </div>
      </div>
      {query.isPending && (
        <p className="text-sm text-muted-foreground">Loading sequences…</p>
      )}
      {query.error && (
        <div role="alert">
          {query.error.message}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.data?.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Mail className="mx-auto mb-3 size-7 text-muted-foreground" />
          <h3 className="font-medium">Welcome your new subscribers</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Add emails and waits, then connect your signup source to enroll new
            subscribers. Unsubscribing stops future emails.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        {query.data
          ?.slice()
          .sort(
            (a, b) =>
              Number(isWelcomeSequence(b.triggerEvent)) -
              Number(isWelcomeSequence(a.triggerEvent)),
          )
          .map((sequence) => (
            <Link
              key={sequence.id}
              href={`${basePath}?tab=sequences&sequence=${sequence.id}`}
              className="rounded-xl border p-5 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">{sequence.name}</h3>
                <Badge variant={sequence.enabled ? "default" : "secondary"}>
                  {sequence.enabled
                    ? "Active"
                    : sequence.triggerEvent === "test.manual"
                      ? "Test"
                      : !isWelcomeSequence(sequence.triggerEvent)
                        ? "Coming later"
                        : sequence.revisionId
                          ? "Paused"
                          : "Draft"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Starts with {sequence.triggerEvent}
              </p>
              {isWelcomeSequence(sequence.triggerEvent) ? (
                <p className="mt-2 text-sm">
                  Introduce your brand to new subscribers. Unsubscribing stops
                  future emails.
                </p>
              ) : sequence.description ? (
                <p className="mt-2 line-clamp-2 text-sm">
                  {sequence.description}
                </p>
              ) : null}
            </Link>
          ))}
      </div>
    </div>
  );
}
function SequenceLoader({
  brandId,
  basePath,
  sequenceId,
}: {
  brandId: string;
  basePath: string;
  sequenceId: string;
}) {
  const query = useQuery(
    orpc.emailSequence.get.queryOptions({
      input: { sequenceId },
      enabled: sequenceId !== "new",
    }),
  );
  if (sequenceId === "new")
    return (
      <SequenceEditor
        brandId={brandId}
        basePath={basePath}
        initial={emptyDraft()}
      />
    );
  if (query.error)
    return (
      <div role="alert">
        {query.error.message}
        <Button variant="ghost" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  if (!query.data) return <p>Loading sequence…</p>;
  if (query.data.brandId !== brandId)
    return <p>This sequence belongs to another brand.</p>;
  return (
    <SequenceEditor
      brandId={brandId}
      basePath={basePath}
      initial={query.data}
      sequenceId={sequenceId}
      initialVersion={query.data.version}
    />
  );
}
function SequenceEditor({
  brandId,
  basePath,
  initial,
  sequenceId: initialId,
  initialVersion,
}: {
  brandId: string;
  basePath: string;
  initial: EmailSequenceDraft;
  sequenceId?: string;
  initialVersion?: number;
}) {
  const client = useQueryClient();
  const testEmail = useMutation(
    orpc.newsletter.sendTest.mutationOptions({
      onSuccess: ({ to }) => toast.success(`Test email sent to ${to}`),
      onError: (error) => toast.error(error.message),
    }),
  );
  const [draft, setDraft] = useState<EmailSequenceDraft>(() =>
    emailSequenceDraftSchema.parse(initial),
  );
  const [sequenceId, setSequenceId] = useState(initialId);
  const [version, setVersion] = useState(initialVersion);
  const [saved, setSaved] = useState(
    JSON.stringify(emailSequenceDraftSchema.parse(initial)),
  );
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const emails = useQuery(
    orpc.emailSequence.emails.queryOptions({ input: { brandId } }),
  );
  const dirty = JSON.stringify(draft) !== saved || !sequenceId;
  const hasNewerVersion =
    initialVersion !== undefined &&
    version !== undefined &&
    initialVersion > version;
  const loadLatest = () => {
    const next = emailSequenceDraftSchema.parse(initial);
    setDraft(next);
    setSaved(JSON.stringify(next));
    setVersion(initialVersion);
  };
  // Reconcile agent/MCP writes only when there is no unsaved operator work.
  useEffect(() => {
    if (!hasNewerVersion || dirty) return;
    const next = emailSequenceDraftSchema.parse(initial);
    setDraft(next);
    setSaved(JSON.stringify(next));
    setVersion(initialVersion);
  }, [hasNewerVersion, dirty, initial, initialVersion]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const guardNavigation = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      )
        return;
      if (!window.confirm("Leave without saving this sequence draft?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [dirty]);
  const error = (e: Error) => toast.error(e.message);
  const save = useMutation(
    orpc.emailSequence.save.mutationOptions({
      onError: error,
      onSuccess: (result, input) => {
        setSequenceId(result.id);
        setVersion(result.version);
        setSaved(JSON.stringify(input.draft));
        if (!input.sequenceId)
          window.history.replaceState(
            null,
            "",
            `${basePath}?tab=sequences&sequence=${result.id}`,
          );
        void client.invalidateQueries({
          queryKey: orpc.emailSequence.key(),
        });
        toast.success("Sequence draft saved");
      },
    }),
  );
  const createEmail = useMutation(
    orpc.emailSequence.createEmail.mutationOptions({ onError: error }),
  );
  const archive = useMutation(
    orpc.emailSequence.archive.mutationOptions({
      onError: error,
      onSuccess: () => {
        window.location.assign(`${basePath}?tab=sequences`);
      },
    }),
  );
  const updateStep = (
    id: string,
    fields: Partial<EmailSequenceDraft["steps"][number]>,
  ) =>
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((s) => (s.id === id ? { ...s, ...fields } : s)),
    }));
  const move = (index: number, direction: number) =>
    setDraft((current) => {
      const steps = [...current.steps];
      const target = index + direction;
      [steps[index], steps[target]] = [steps[target]!, steps[index]!];
      return { ...current, steps };
    });
  let offset = 0;
  const timeline = draft.steps.map((step) => ({
    ...step,
    offset: (offset += step.waitMinutes),
  }));
  const sender = emails.data?.sender;
  return (
    <div className="space-y-6">
      {hasNewerVersion && dirty && (
        <div role="alert" className="rounded-lg border p-3 text-sm">
          This sequence was updated elsewhere. Your unsaved draft is preserved.
          Load the latest version before continuing.
          <Button
            variant="outline"
            className="ml-3"
            onClick={() => {
              if (
                window.confirm(
                  "Discard your unsaved edits and load the latest saved sequence?",
                )
              )
                loadLatest();
            }}
          >
            Load latest version
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href={`${basePath}?tab=sequences`}>← All sequences</Link>
        </Button>
        <div className="flex items-center gap-3">
          <SequenceChatStart
            brandId={brandId}
            sequenceId={sequenceId}
            disabled={dirty || save.isPending}
          />
          <span className="text-xs text-muted-foreground">
            {dirty ? "Unsaved draft" : "Draft saved"}
          </span>
          <Button
            disabled={
              save.isPending ||
              createEmail.isPending ||
              !dirty ||
              hasNewerVersion
            }
            onClick={() => {
              const parsed = emailSequenceDraftSchema.safeParse(draft);
              if (!parsed.success)
                return toast.error(
                  parsed.error.issues[0]?.message ?? "Check the sequence",
                );
              save.mutate({
                brandId,
                sequenceId,
                expectedVersion: version,
                draft: parsed.data,
              });
            }}
          >
            {save.isPending ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-8 @4xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="sequence-name">Sequence name</Label>
            <Input
              id="sequence-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Textarea
              aria-label="Sequence purpose"
              placeholder="What should this sequence help someone do?"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>
          <div className="rounded-xl border bg-muted/20 p-5">
            <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Start
            </p>
            <Label htmlFor="sequence-event">When this event happens</Label>
            <Input
              id="sequence-event"
              className="mt-2"
              placeholder="account.created"
              value={draft.triggerEvent}
              onChange={(e) =>
                setDraft({ ...draft, triggerEvent: e.target.value })
              }
            />
            <p className="mt-2 text-xs text-muted-foreground">
              A product event or a manual enrollment starts one recipient’s
              timeline.
            </p>
          </div>
          <div className="ml-5 space-y-5 border-l-2 pl-6">
            {timeline.map((step, index) => (
              <div key={step.id} className="relative space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Clock3 className="size-4 text-muted-foreground" />
                  <span>Wait</span>
                  <WaitInput
                    label={`Wait before email ${index + 1}`}
                    minutes={step.waitMinutes}
                    onChange={(waitMinutes) =>
                      updateStep(step.id, { waitMinutes })
                    }
                  />
                  <span className="text-muted-foreground">
                    {index ? "after previous email" : "after entry"}
                  </span>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      EMAIL {index + 1} ·{" "}
                      {step.offset
                        ? `+${duration(step.offset)} from entry`
                        : "At entry"}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move email ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move email ${index + 1} down`}
                        disabled={index === timeline.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove email ${index + 1}`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            steps: draft.steps.filter((s) => s.id !== step.id),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    aria-label={`Email ${index + 1} step name`}
                    value={step.name}
                    onChange={(e) =>
                      updateStep(step.id, { name: e.target.value })
                    }
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={step.platformPostId ?? "none"}
                      onValueChange={(value) =>
                        updateStep(step.id, {
                          platformPostId: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger
                        className="min-w-0 flex-1"
                        aria-label={`Choose email ${index + 1}`}
                      >
                        <SelectValue placeholder="Choose an email draft" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Choose an email draft
                        </SelectItem>
                        {emails.data?.emails.map((email) => (
                          <SelectItem key={email.id} value={email.id}>
                            {email.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {step.platformPostId && (
                      <Button
                        variant="outline"
                        disabled={testEmail.isPending}
                        onClick={() =>
                          testEmail.mutate({
                            platformPostId: step.platformPostId!,
                          })
                        }
                      >
                        Send test to me
                      </Button>
                    )}
                    {step.platformPostId ? (
                      <Button variant="outline" asChild>
                        <Link
                          href={`/app/newsletters/${step.platformPostId}`}
                          target="_blank"
                        >
                          Edit email ↗
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={createEmail.isPending}
                        onClick={async () => {
                          try {
                            const email = await createEmail.mutateAsync({
                              brandId,
                              title: step.name,
                            });
                            updateStep(step.id, {
                              platformPostId: email.platformPostId,
                            });
                            await client.invalidateQueries({
                              queryKey: orpc.emailSequence.emails.key(),
                            });
                          } catch {
                            /* mutation displays the error */
                          }
                        }}
                      >
                        Create email
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              disabled={draft.steps.length >= 50}
              onClick={() =>
                setDraft({
                  ...draft,
                  steps: [
                    ...draft.steps,
                    {
                      id: crypto.randomUUID(),
                      name: `Email ${draft.steps.length + 1}`,
                      platformPostId: null,
                      waitMinutes: draft.steps.length ? 1440 : 0,
                    },
                  ],
                })
              }
            >
              <Plus className="size-4" />
              Add email
            </Button>
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Finish sequence
            </div>
          </div>
        </div>
        <aside className="space-y-5 rounded-xl border p-5">
          <h3 className="font-medium">At a glance</h3>
          <p className="text-sm">
            {draft.steps.length} emails · {duration(offset)}
            {offset ? " total" : ""}
          </p>
          <ConditionEditor
            label="Stop sending when"
            value={draft.exitCondition}
            onChange={(exitCondition) => setDraft({ ...draft, exitCondition })}
          />
          <p className="text-xs text-muted-foreground">
            The exit rule checks the recipient’s latest profile before each
            email.
          </p>
          <hr />
          <p className="text-sm text-muted-foreground">
            Emails use your existing editor, templates, and brand sender.
            Editing this draft leaves reviewed versions unchanged.
          </p>
          {emails.error && (
            <p role="alert" className="text-sm text-muted-foreground">
              {emails.error.message}
            </p>
          )}
        </aside>
      </div>
      {sequenceId && (
        <div className="border-t pt-5">
          <Button
            variant="outline"
            disabled={dirty}
            onClick={() => setDeliveryOpen(!deliveryOpen)}
          >
            {deliveryOpen ? "Hide delivery controls" : "Review & delivery"}
          </Button>
          {dirty && (
            <p className="mt-2 text-sm text-muted-foreground">
              Save the draft to review its emails and timing.
            </p>
          )}
          {deliveryOpen && !dirty && (
            <ExecutionPanel
              key={`${sequenceId}:${version}`}
              sequenceId={sequenceId}
              initialSettings={{
                from: sender?.fromEmail
                  ? `${sender.fromName || ""} <${sender.fromEmail}>`.trim()
                  : "",
                replyTo: sender?.replyTo || undefined,
                triggerEvent: draft.triggerEvent,
                exitCondition: draft.exitCondition,
                conditions: {},
              }}
            />
          )}
        </div>
      )}
      {sequenceId && (
        <div className="pt-4 text-sm">
          {archiving ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Archive and cancel unfinished enrollments? A send already in
                progress may finish.
              </span>
              <Button
                variant="destructive"
                disabled={archive.isPending}
                onClick={() => archive.mutate({ sequenceId })}
              >
                Archive sequence
              </Button>
              <Button variant="ghost" onClick={() => setArchiving(false)}>
                Keep sequence
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setArchiving(true)}>
              Archive sequence
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
