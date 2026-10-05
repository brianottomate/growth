"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import type { ToolUIPart } from "ai";
import { ArrowLeft, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme";
import { renderToolPart } from "@/app/app/overview/OverviewChat";
import { ChatNextOptions } from "@/app/app/overview/ChatNextOptions";
import { ChatQueue } from "@/app/app/overview/ChatQueue";
import type { ChatTurnSnapshot } from "@/lib/chat-turns";
import { VoiceWorkbench } from "./VoiceWorkbench";
import { nextMessages, specimens, resultPart } from "./fixtures";
import type { GrowthActionPolicy } from "@/server/ai/kernel/policy";

type CatalogEntry = GrowthActionPolicy & {
  capability: string;
  action: string;
  label: string;
};
const subscribeToClient = () => () => {
  // The client marker never changes after hydration.
};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const sections = [
  ["conversation", "Conversation"],
  ["lifecycle", "Tool lifecycle"],
  ["results", "Result cards"],
  ["next-turn", "Follow-up & queue"],
  ["voice", "Voice & dictation"],
  ["catalog", "Tool inventory"],
];
const initialQueue: ChatTurnSnapshot = {
  activeTurnId: null,
  paused: true,
  stopRequested: false,
  messages: [],
  inputs: [
    {
      id: "fixture-queued",
      owned: true,
      status: "queued",
      error: null,
      payload: {
        message: {
          id: "fixture-queued",
          role: "user",
          parts: [
            { type: "text", text: "Adapt the coastal idea for Instagram." },
          ],
        },
        context: { surface: "overview" },
      },
    },
    {
      id: "fixture-failed",
      owned: true,
      status: "failed",
      error: "The source was unavailable.",
      payload: {
        message: {
          id: "fixture-failed",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Read the source before revising the caption.",
            },
          ],
        },
        context: { surface: "overview" },
      },
    },
  ],
};
function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-6 border-t py-10">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}
function SpecimenFrame({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="font-mono text-[10px] break-all text-muted-foreground">
          {source}
        </span>
      </div>
      <div className="min-w-0 space-y-3 p-4">{children}</div>
    </div>
  );
}
export function AssistantGallery({ catalog }: { catalog: CatalogEntry[] }) {
  const hydrated = useSyncExternalStore(
    subscribeToClient,
    clientSnapshot,
    serverSnapshot,
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [width, setWidth] = useState("full");
  const [consequence, setConsequence] = useState("all");
  const [notice, setNotice] = useState(
    "Choose an option or try an approval to inspect its handoff here.",
  );
  const [draft, setDraft] = useState("");
  const [approved, setApproved] = useState<boolean | null>(null);
  const [queue, setQueue] = useState(initialQueue);
  const announce = (text: string) => setNotice(text);
  const render = (part: ToolUIPart, running = false, superseded = false) =>
    renderToolPart(
      part,
      part.toolCallId,
      superseded,
      (value) => {
        setApproved(value);
        announce(
          value
            ? "Demo approval accepted. No provider request was sent."
            : "Demo action declined.",
        );
      },
      announce,
      (intent) => announce(JSON.stringify(intent)),
      running,
    );
  const approval: ToolUIPart = {
    type: "tool-publishingWrite",
    toolCallId: "fixture-approval",
    state: "approval-requested",
    input: {
      action: "schedule",
      platform: "instagram",
      localDateTime: "2026-10-09T09:00",
      timeZone: "America/New_York",
    },
    approval: { id: "fixture-approval" },
  };
  const filtered = specimens.filter(
    (s) =>
      (category === "All" || s.category === category) &&
      `${s.title} ${s.note} ${s.capability} ${s.action}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const actions = catalog.filter(
    (s) =>
      `${s.capability} ${s.action} ${s.label}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (consequence === "all" || s.consequence === consequence),
  );
  const controlQueue = async (action: string, id?: string, text?: string) => {
    setQueue((current) => ({
      ...current,
      paused:
        action === "pause"
          ? true
          : action === "resume"
            ? false
            : current.paused,
      inputs:
        action === "cancel"
          ? current.inputs.filter((item) => item.id !== id)
          : current.inputs.map((item) =>
              item.id !== id
                ? item
                : {
                    ...item,
                    status: action === "retry" ? "queued" : item.status,
                    error: action === "retry" ? null : item.error,
                    payload:
                      action === "edit" && text
                        ? {
                            ...item.payload,
                            message: {
                              ...item.payload.message,
                              parts: [{ type: "text", text }],
                            },
                          }
                        : item.payload,
                  },
            ),
    }));
    announce(`Demo queue: ${action}${text ? ` · ${text}` : ""}`);
    return true;
  };
  // Product cards format dates in the operator's locale. The private gallery
  // mounts them after hydration so server locale cannot change fixture text.
  if (!hydrated)
    return (
      <main className="mx-auto max-w-7xl p-8" aria-busy="true">
        <h1 className="text-3xl font-semibold">Assistant gallery</h1>
        <p className="mt-4 text-sm text-muted-foreground">Loading specimens…</p>
      </main>
    );
  return (
    <main
      className="@container mx-auto max-w-7xl px-4 py-8 sm:px-8"
      onClickCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        const href = event.target.closest("a[href]")?.getAttribute("href");
        if (href?.includes("fixture-")) {
          event.preventDefault();
          announce(`Demo destination: ${href}`);
        }
      }}
    >
      <header className="space-y-6 pb-8">
        <div className="flex items-center justify-between">
          <Link
            href="/lab"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Growth Lab
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/lab/design-system/connectors">
                Connector UI workbench
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <div className="max-w-3xl">
          <p className="mb-3 text-xs tracking-widest text-muted-foreground uppercase">
            Design system / Assistant
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            The assistant, in pieces.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Explore the cards and interactions that turn Growth conversations
            into work. These specimens use the production renderers with
            synthetic data. Every demo handoff stays on this page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border px-3 py-1">
            {specimens.length} result specimens
          </span>
          <span className="rounded-full border px-3 py-1">
            {new Set(catalog.map((c) => c.capability)).size} capabilities
          </span>
          <span className="rounded-full border px-3 py-1">
            {catalog.length} actions
          </span>
        </div>
      </header>
      <nav
        aria-label="Gallery sections"
        className="sticky top-0 z-10 flex flex-wrap gap-x-5 gap-y-2 border-y bg-background/95 py-4 text-sm backdrop-blur"
      >
        {sections.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="my-6 flex flex-wrap items-end gap-3">
        <div className="w-full min-w-0 sm:flex-1">
          <label
            htmlFor="gallery-search"
            className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Search className="size-3.5" />
            Find a specimen or tool
          </label>
          <Input
            id="gallery-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try media, publishing, or saved…"
          />
        </div>
        <SimpleSelect
          aria-label="Specimen width"
          value={width}
          onValueChange={setWidth}
          options={[
            { value: "full", label: "Full canvas" },
            { value: "dock", label: "Assistant dock · 420px" },
            { value: "phone", label: "Phone · 360px" },
          ]}
        />
        <Button
          variant="outline"
          onClick={() => {
            setQuery("");
            setCategory("All");
            setConsequence("all");
            setApproved(null);
            setQueue(initialQueue);
            setDraft("");
            setNotice("Gallery reset.");
          }}
        >
          <RotateCcw className="size-4" />
          Reset
        </Button>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="mb-6 rounded-lg border bg-muted/30 px-4 py-3 text-xs break-words"
      >
        {notice}
      </div>
      <div
        className="@container mx-auto w-full"
        style={{
          maxWidth:
            width === "dock" ? 420 : width === "phone" ? 360 : undefined,
        }}
      >
        <Section
          id="conversation"
          title="Conversation anatomy"
          note="A short exchange combines prose, a structured result, and a focused next step. Resize the canvas to inspect the dock and phone layouts."
        >
          <SpecimenFrame
            title="From question to next step"
            source="OverviewChat · production tool renderer"
          >
            <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm">
              What’s waiting in the pipeline?
            </div>
            <p className="text-sm leading-relaxed">
              Six posts are scheduled. The remaining drafts need a quick copy
              pass before review.
            </p>
            {render(resultPart(specimens.find((s) => s.id === "pipeline")!))}
            <div
              className="rounded-xl border bg-muted/30 px-3 py-2"
              aria-label="Message composer"
            >
              <ChatNextOptions
                messages={nextMessages}
                disabled={false}
                choose={(option) => {
                  if (option.kind === "detail") setDraft(option.text);
                  announce(option.text);
                }}
              />
              <Textarea
                rows={2}
                className="max-h-40 resize-none"
                appearance="composer"
                aria-label="Demo composer"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Try a follow-up here…"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={!draft.trim()}
                  onClick={() => {
                    announce(`Demo message: ${draft}`);
                    setDraft("");
                  }}
                >
                  Send demo message
                </Button>
              </div>
            </div>
          </SpecimenFrame>
        </Section>
        <Section
          id="lifecycle"
          title="Tool lifecycle"
          note="Inspect the same states used in chat, including unfinished work, provider failures, and approval recovery."
        >
          <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
            <SpecimenFrame title="Working" source="ToolCallPending">
              {render(
                {
                  type: "tool-researchRead",
                  toolCallId: "fixture-working",
                  state: "input-available",
                  input: { action: "search" },
                },
                true,
              )}
            </SpecimenFrame>
            <SpecimenFrame title="Interrupted" source="renderToolPart">
              {render({
                type: "tool-researchRead",
                toolCallId: "fixture-interrupted",
                state: "input-available",
                input: { action: "search" },
              })}
            </SpecimenFrame>
            <SpecimenFrame title="Provider error" source="renderToolPart">
              {render({
                type: "tool-researchRead",
                toolCallId: "fixture-error",
                state: "output-error",
                input: { action: "search" },
                errorText:
                  "The source timed out. Try another source or retry later.",
              })}
            </SpecimenFrame>
            <SpecimenFrame
              title="Policy failure"
              source="Capability error envelope"
            >
              {render({
                type: "tool-adsWrite",
                toolCallId: "fixture-policy",
                state: "output-available",
                input: { action: "push" },
                output: {
                  ok: false,
                  error: {
                    message:
                      "Choose an allowlisted ad account before continuing.",
                  },
                },
              })}
            </SpecimenFrame>
            <SpecimenFrame title="Approval requested" source="ApprovalCard">
              {approved === null ? (
                render(approval)
              ) : (
                <p className="text-sm">
                  {approved
                    ? "Approved in this demo."
                    : "Declined in this demo."}
                </p>
              )}
            </SpecimenFrame>
            <SpecimenFrame title="Superseded approval" source="ApprovalCard">
              {render(
                { ...approval, toolCallId: "fixture-superseded" },
                false,
                true,
              )}
            </SpecimenFrame>
            <SpecimenFrame title="Declined" source="renderToolPart">
              {render({
                type: "tool-publishingWrite",
                toolCallId: "fixture-denied",
                state: "output-denied",
                input: { action: "schedule" },
                approval: { id: "fixture-denied", approved: false },
              })}
            </SpecimenFrame>
          </div>
        </Section>
        <Section
          id="results"
          title="Generated result cards"
          note="Fixture-backed examples of the actual Growth cards. Result buttons report their proposed prompt above. Fixture detail links report their destination above. Workspace links open the product."
        >
          <div className="flex flex-wrap gap-2" aria-label="Result categories">
            {["All", ...new Set(specimens.map((s) => s.category))].map((c) => (
              <Button
                key={c}
                size="sm"
                variant={category === c ? "default" : "outline"}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} results
          </p>
          <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2">
            {filtered.map((s) => (
              <SpecimenFrame
                key={s.id}
                title={s.title}
                source={`${s.capability}.${s.action}`}
              >
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {s.note}
                </p>
                {render(resultPart(s))}
              </SpecimenFrame>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="rounded-lg border p-6 text-sm text-muted-foreground">
              No matching specimens. Clear the search or choose another
              category.
            </p>
          )}
        </Section>
        <Section
          id="next-turn"
          title="Follow-up & queue"
          note="Suggested replies, editable details, paused input, and retries. Queue controls operate on local fixtures."
        >
          <SpecimenFrame title="Suggested next steps" source="ChatNextOptions">
            <div
              className="rounded-xl border bg-muted/30 px-3 py-2"
              aria-label="Follow-up composer"
            >
              <ChatNextOptions
                messages={nextMessages}
                disabled={false}
                choose={(option) => {
                  if (option.kind === "detail") setDraft(option.text);
                  announce(`${option.kind}: ${option.text}`);
                }}
              />
              <Textarea
                rows={2}
                className="max-h-40 resize-none"
                aria-label="Follow-up draft"
                appearance="composer"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write your next message…"
              />
            </div>
          </SpecimenFrame>
          <SpecimenFrame title="Durable input queue" source="ChatQueue">
            <ChatQueue state={queue} control={controlQueue} />
            {queue.inputs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Demo queue cleared. Reset to restore it.
              </p>
            )}
          </SpecimenFrame>
        </Section>
        <Section
          id="voice"
          title="Voice & dictation"
          note="Try editable dictation, microphone pause, spoken captions, and steering. These specimens use sample state and make no provider calls."
        >
          <SpecimenFrame
            title="Speech and current work"
            source="AssistantVoiceControls · ChatQueue"
          >
            <VoiceWorkbench />
          </SpecimenFrame>
        </Section>
        <Section
          id="catalog"
          title="Canonical tool inventory"
          note="Generated from Growth’s capability catalog and execution policies. Search every action, inspect approval requirements, and see which surfaces can use it."
        >
          <SimpleSelect
            aria-label="Filter action consequence"
            value={consequence}
            onValueChange={setConsequence}
            options={[
              { value: "all", label: "All consequences" },
              ...Array.from(new Set(catalog.map((c) => c.consequence))).map(
                (value) => ({ value, label: value }),
              ),
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {actions.length} of {catalog.length} actions
          </p>
          <div className="space-y-2">
            {actions.map((entry) => (
              <details
                key={`${entry.capability}.${entry.action}`}
                className="min-w-0 rounded-lg border bg-card p-4"
              >
                <summary className="cursor-pointer text-sm break-words">
                  <span className="font-mono">
                    {entry.capability}.{entry.action}
                  </span>
                  <span className="ml-3 text-xs text-muted-foreground">
                    {entry.consequence}
                    {entry.approval === "user" ? " · approval required" : ""}
                  </span>
                </summary>
                <dl className="mt-4 grid grid-cols-1 gap-3 text-xs @xl:grid-cols-2">
                  {Object.entries({
                    Label: entry.label,
                    Access: entry.access,
                    Approval: entry.approval,
                    Idempotent: entry.idempotent ? "Yes" : "No",
                    Reversible: entry.reversible ? "Yes" : "No",
                    "Undo with": entry.undoWith ?? "—",
                    Surfaces: entry.surfaces.join(", "),
                  }).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="mt-1 break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No actions match these filters.
            </p>
          )}
        </Section>
      </div>
    </main>
  );
}
