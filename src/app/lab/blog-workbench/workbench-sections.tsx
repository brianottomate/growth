import type { ReactNode } from "react";

import type { BlogRunRecord } from "@/server/services/blog-workbench/run";
import type { WorkbenchSnapshot } from "@/server/services/blog-workbench/workflow";

export function StoryboardWorkbenchView({
  run,
  workbench,
}: {
  run: BlogRunRecord;
  workbench: WorkbenchSnapshot;
}) {
  return (
    <div className="space-y-4">
      <Intro
        eyebrow="Plan before prose"
        title={`${run.storyboard.length} sections with explicit editorial jobs`}
        body="The storyboard is the contract between the brief and the writer. A local agent can challenge the sequence, evidence, promotion, and visual placement before it spends another long generation call."
      />
      <div className="space-y-3">
        {run.storyboard.map((section) => {
          const comments = workbench.comments.filter(
            (comment) =>
              comment.sectionHeading === section.heading &&
              comment.status === "open",
          );
          const visuals = workbench.visuals.filter(
            (visual) =>
              section.visualDirectionIds?.includes(visual.id) ||
              visual.placement === section.heading,
          );
          return (
            <article
              key={section.index}
              className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 lg:grid-cols-[52px_minmax(0,1fr)_260px]"
            >
              <div className="grid size-10 place-items-center rounded-xl bg-lime-300 text-sm font-bold text-stone-950">
                {section.index}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">
                    {section.heading}
                  </h2>
                  <StatusPill tone={comments.length ? "attention" : "quiet"}>
                    {comments.length
                      ? `${comments.length} review comments`
                      : "clear in review"}
                  </StatusPill>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
                  {section.purpose ?? section.keyPoints[0]}
                </p>
                <ul className="mt-3 space-y-1.5 text-[10px] text-stone-500">
                  {section.keyPoints.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-stone-600" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3 rounded-xl border border-white/8 bg-black/20 p-3">
                <Metric
                  label="Generated"
                  value={`${section.wordCount} words`}
                />
                <Metric
                  label="Promotion"
                  value={section.promotion?.decision ?? "derived from draft"}
                />
                <div>
                  <p className="text-[8px] font-bold tracking-[0.16em] text-stone-600 uppercase">
                    Visual directions
                  </p>
                  {visuals.length ? (
                    <div className="mt-2 space-y-1.5">
                      {visuals.map((visual) => (
                        <div
                          key={visual.id}
                          className="rounded-lg border border-white/8 px-2.5 py-2 text-[9px] text-stone-400"
                        >
                          {visual.purpose}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[9px] text-stone-600">
                      No visual requested for this section.
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewWorkbenchView({
  workbench,
}: {
  workbench: WorkbenchSnapshot;
}) {
  const openComments = workbench.comments.filter(
    (comment) => comment.status === "open",
  );
  const major = openComments.filter(
    (comment) => comment.severity === "major",
  ).length;
  return (
    <div className="space-y-5">
      <Intro
        eyebrow="Anchored editorial review"
        title={`${openComments.length} open comments, ${major} major`}
        body="Every comment carries a stable ID, an exact excerpt, and a section anchor. The next agent receives the same IDs and returns one disposition for each."
      />
      <div className="space-y-2">
        {workbench.comments.map((comment) => (
          <article
            key={comment.id}
            className={`rounded-2xl border p-4 ${
              comment.severity === "major"
                ? "border-amber-300/30 bg-amber-300/[0.045]"
                : "border-white/10 bg-white/[0.025]"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                tone={comment.severity === "major" ? "attention" : "quiet"}
              >
                {comment.severity}
              </StatusPill>
              <StatusPill tone="quiet">{comment.status}</StatusPill>
              <StatusPill tone="quiet">
                {comment.kind.replace(/_/g, " ")}
              </StatusPill>
              <code className="text-[9px] text-stone-600">{comment.id}</code>
              <span className="text-[9px] text-stone-500">
                {comment.sectionHeading}
              </span>
            </div>
            <blockquote className="mt-3 border-l border-amber-200/30 pl-3 text-[11px] leading-relaxed text-stone-400 italic">
              “{comment.excerpt}”
            </blockquote>
            <p className="mt-3 text-[11px] leading-relaxed text-stone-200">
              {comment.note}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function VisualsWorkbenchView({
  workbench,
}: {
  workbench: WorkbenchSnapshot;
}) {
  return (
    <div className="space-y-5">
      <Intro
        eyebrow="Directions before assets"
        title={`${workbench.visuals.length} visual requests with named owners`}
        body="The writer chooses purpose and placement. A local agent or teammate fulfills the asset later. Until then, the workbench displays the direction and keeps completion claims honest."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {workbench.visuals.map((visual) => (
          <article
            key={visual.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"
          >
            <div className="grid aspect-[16/7] place-items-center border-b border-dashed border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(190,242,100,0.1),transparent_55%)] p-6 text-center">
              <div className="max-w-md">
                <p className="text-[8px] font-bold tracking-[0.2em] text-lime-200/70 uppercase">
                  Visual direction
                </p>
                <p className="mt-2 text-xs leading-relaxed text-stone-300">
                  {visual.direction}
                </p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] text-stone-600">
                    {visual.placement}
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-white">
                    {visual.purpose}
                  </h2>
                </div>
                <StatusPill tone="waiting">{visual.status}</StatusPill>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone="quiet">
                  owner {visual.fulfillmentOwner.replace("-", " ")}
                </StatusPill>
                <code className="text-[9px] text-stone-600">{visual.id}</code>
              </div>
              <ul className="space-y-1.5 text-[10px] text-stone-500">
                {visual.constraints.map((constraint) => (
                  <li key={constraint} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-lime-300/60" />
                    {constraint}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AgentWorkbenchView({
  workbench,
}: {
  workbench: WorkbenchSnapshot;
}) {
  return (
    <div className="space-y-5">
      <Intro
        eyebrow="Agent-accompanied by design"
        title="Keep ChatGPT, Codex, or Claude Code beside the workbench"
        body="The web page remains the inspectable artifact. The local agent reads the repository, runs the generator, and carries anchored comments into the next immutable revision."
      />
      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <CommandCard
            label="Run the fixture generator"
            command="bun run lab:blog-run"
          />
          <CommandCard
            label="Print the current revision packet"
            command="bun run lab:blog-agent-brief"
          />
          <CommandCard
            label="Derive the DatoCMS draft"
            command="bun run lab:blog-export-dato"
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-[10px] leading-relaxed text-stone-500">
            A generator run makes a new directory under
            <code className="mx-1 text-stone-300">fixtures/blog/runs</code>.
            Existing receipts remain unchanged.
          </div>
        </aside>
        <section>
          <p className="mb-2 text-[8px] font-bold tracking-[0.2em] text-stone-600 uppercase">
            Current agent brief
          </p>
          <pre className="max-h-[72vh] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-5 text-[10px] leading-relaxed whitespace-pre-wrap text-stone-300">
            {workbench.agentBrief}
          </pre>
        </section>
      </div>
    </div>
  );
}

function Intro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <p className="text-[8px] font-bold tracking-[0.2em] text-lime-200/70 uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-xl font-semibold text-white">{title}</h1>
      <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-stone-400">
        {body}
      </p>
    </header>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-bold tracking-[0.16em] text-stone-600 uppercase">
        {label}
      </p>
      <p className="mt-1 text-[10px] text-stone-300">{value}</p>
    </div>
  );
}

function CommandCard({ label, command }: { label: string; command: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-[9px] text-stone-500">{label}</p>
      <code className="mt-2 block text-[10px] text-lime-200">{command}</code>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "attention" | "quiet" | "waiting";
  children: ReactNode;
}) {
  const style = {
    attention: "bg-amber-300/15 text-amber-200",
    quiet: "bg-white/8 text-stone-400",
    waiting: "bg-blue-300/10 text-blue-200",
  }[tone];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[8px] font-medium ${style}`}
    >
      {children}
    </span>
  );
}
