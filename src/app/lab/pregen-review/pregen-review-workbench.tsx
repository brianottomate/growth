"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Columns3,
  FileJson2,
  FlaskConical,
  Monitor,
  PanelRight,
  Smartphone,
  Sparkles,
} from "lucide-react";

import {
  CANDIDATE_PIPELINE,
  EVALUATION_PIPES,
  PREGEN_REVIEW_FIXTURE,
  type CompositionSection,
  type EvaluationPipe,
  type EvaluationPipeId,
  type ReviewMode,
} from "@/data/pregen-review";

type Viewport = "desktop" | "mobile";

const MODES: Array<{
  id: ReviewMode;
  label: string;
  icon: typeof Columns3;
}> = [
  { id: "side-by-side", label: "Compare", icon: Columns3 },
  { id: "revision", label: "Revision + notes", icon: PanelRight },
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
];

function SegmentButton({
  active,
  ariaLabel,
  children,
  onClick,
}: {
  active: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
        active
          ? "bg-white text-stone-950 shadow-sm"
          : "text-stone-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function FlowCard({
  number,
  title,
  detail,
  selected,
}: {
  number: string;
  title: string;
  detail: string;
  selected?: boolean;
}) {
  return (
    <div
      className={`min-w-[220px] flex-1 rounded-xl border p-3 ${
        selected
          ? "border-lime-300/60 bg-lime-300/10"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid size-5 place-items-center rounded-full text-[10px] font-bold ${
            selected
              ? "bg-lime-300 text-stone-950"
              : "bg-white/10 text-stone-300"
          }`}
        >
          {number}
        </span>
        <span className="text-xs font-semibold text-white">{title}</span>
        {selected ? (
          <span className="ml-auto rounded bg-lime-300/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-lime-200 uppercase">
            this lab
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
        {detail}
      </p>
    </div>
  );
}

function EvaluationPipeCard({
  pipe,
  selected,
  onSelect,
}: {
  pipe: EvaluationPipe;
  selected: boolean;
  onSelect: () => void;
}) {
  const needsHuman = pipe.status === "fixture-review";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-w-[235px] flex-1 rounded-xl border p-3 text-left transition ${
        selected
          ? "border-lime-300/50 bg-lime-300/10"
          : "border-white/10 bg-white/[0.035] hover:border-white/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold text-white">
            {pipe.label}
          </div>
          <div className="mt-1 text-[8px] tracking-wider text-stone-600 uppercase">
            {pipe.evaluator}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[8px] font-bold tracking-wider uppercase ${
            needsHuman
              ? "bg-amber-300/10 text-amber-200"
              : "bg-lime-300/10 text-lime-200"
          }`}
        >
          {needsHuman ? "review" : "fixture pass"}
        </span>
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-stone-400">
        {pipe.question}
      </p>
      <div className="mt-3 font-mono text-[8px] text-stone-600">
        {pipe.receipt}
      </div>
    </button>
  );
}

function EvaluationReceipt({ pipe }: { pipe: EvaluationPipe }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-semibold text-stone-300">
          {pipe.label} receipt
        </div>
        <span className="font-mono text-[8px] text-stone-600">
          {pipe.receipt}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {pipe.checks.map((check) => (
          <div
            key={check.label}
            className="rounded-lg border border-white/8 bg-white/[0.025] p-2.5"
          >
            <div className="text-[8px] text-stone-600">{check.label}</div>
            <div className="mt-1 text-[10px] font-medium text-stone-300">
              {check.result}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/8 pt-2 font-mono text-[8px] text-stone-600">
        <span>input: {pipe.input}</span>
        <span>independent receipt · no evaluator dependency</span>
      </div>
    </div>
  );
}

function Photo({ variant }: { variant: "hero" | "home" | "coast" }) {
  const backgrounds = {
    hero: "linear-gradient(140deg, #e9dcc4 0%, #8da2a0 42%, #394e51 100%)",
    home: "linear-gradient(135deg, #6f7c6f 0%, #cbbda4 48%, #f0e8dc 100%)",
    coast: "linear-gradient(145deg, #d8c8ad 0%, #748b8c 50%, #273d44 100%)",
  };

  return (
    <div
      className="relative h-full min-h-36 overflow-hidden bg-stone-300"
      style={{ background: backgrounds[variant] }}
    >
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-stone-950/35 to-transparent" />
      <div className="absolute right-[12%] bottom-[18%] h-20 w-32 rounded-t-[2rem] border border-white/40 bg-stone-100/70 shadow-2xl" />
      <div className="absolute right-[18%] bottom-[18%] h-11 w-5 bg-stone-800/45" />
      <div className="absolute bottom-[18%] left-[12%] size-16 rounded-full bg-stone-900/25 blur-sm" />
    </div>
  );
}

function SourceSite({
  section,
  viewport,
}: {
  section: CompositionSection;
  viewport: Viewport;
}) {
  return (
    <div className="h-full overflow-hidden rounded-[inherit] bg-[#f7f6f2] text-stone-900">
      <div className="flex h-10 items-center justify-between border-b border-stone-200 px-4 text-[8px] font-semibold tracking-[0.18em] uppercase">
        <span>Driftwood Stays</span>
        <span className="text-stone-400">
          Homes&nbsp;&nbsp; About&nbsp;&nbsp; Contact
        </span>
      </div>
      {section.id === "hero" ? (
        <div
          className={`grid h-[calc(100%-2.5rem)] ${
            viewport === "mobile"
              ? "grid-rows-[44%_56%]"
              : "grid-rows-[54%_46%]"
          }`}
        >
          <Photo variant="hero" />
          <div
            className={`flex flex-col items-center justify-center text-center ${
              viewport === "mobile" ? "px-5" : "px-10"
            }`}
          >
            <h3 className="font-serif text-[clamp(18px,1.8vw,30px)] leading-tight">
              {section.sourceTitle}
            </h3>
            <p className="mt-2 max-w-lg text-[9px] leading-relaxed text-stone-500">
              {section.sourceBody}
            </p>
            <div className="mt-4 flex gap-2">
              <span className="bg-stone-900 px-4 py-2 text-[8px] text-white">
                Browse homes
              </span>
              <span className="border border-stone-300 px-4 py-2 text-[8px]">
                Learn more
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {section.id === "properties" ? (
        <div className="p-6">
          <h3 className="text-center font-serif text-2xl">
            {section.sourceTitle}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-center text-[9px] text-stone-500">
            {section.sourceBody}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              "Haystack House",
              "The Jetty",
              "Spruce Hideaway",
              "Pacific House",
            ].map((name, i) => (
              <div key={name} className="border border-stone-200 bg-white">
                <div className="h-16">
                  <Photo variant={i % 2 ? "coast" : "home"} />
                </div>
                <div className="p-2">
                  <div className="text-[9px] font-semibold">{name}</div>
                  <div className="mt-1 text-[7px] text-stone-400">
                    3 beds · 2 baths · Sleeps 6 · From $280
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {section.id === "trust" ? (
        <div className="grid h-[calc(100%-2.5rem)] grid-rows-[55%_45%]">
          <Photo variant="coast" />
          <div className="px-8 py-6 text-center">
            <h3 className="font-serif text-2xl">{section.sourceTitle}</h3>
            <p className="mx-auto mt-3 max-w-lg text-[9px] leading-relaxed text-stone-500">
              {section.sourceBody}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProposedSite({
  section,
  viewport,
}: {
  section: CompositionSection;
  viewport: Viewport;
}) {
  return (
    <div className="h-full overflow-hidden rounded-[inherit] bg-[#f0eadf] text-[#193334]">
      <div className="flex h-10 items-center justify-between border-b border-[#193334]/10 px-4 text-[8px] font-semibold tracking-[0.18em] uppercase">
        <span>Driftwood</span>
        <span className="rounded-full bg-[#193334] px-3 py-1.5 text-[7px] text-white">
          Find a home
        </span>
      </div>
      {section.id === "hero" ? (
        <div
          className={`grid h-[calc(100%-2.5rem)] ${
            viewport === "mobile"
              ? "grid-rows-[52%_48%]"
              : "grid-cols-[54%_46%]"
          }`}
        >
          <div
            className={`flex flex-col justify-between ${
              viewport === "mobile"
                ? "order-2 p-5"
                : "min-w-0 p-[clamp(18px,1.6vw,28px)]"
            }`}
          >
            <div>
              <div className="text-[7px] font-semibold tracking-[0.22em] text-[#d0663d] uppercase">
                Oregon coast stays
              </div>
              <h3 className="mt-3 font-serif text-[clamp(22px,1.7vw,30px)] leading-[1.02] text-balance break-words">
                {section.proposedTitle}
              </h3>
              <p className="mt-3 max-w-sm text-[9px] leading-relaxed text-[#193334]/65">
                {section.proposedBody}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-[#193334]/15 pt-3 text-[7px]">
              <div>
                <b className="block text-sm">18</b>homes
              </div>
              <div>
                <b className="block text-sm">4.9</b>guest rating
              </div>
              <div>
                <b className="block text-sm">2</b>coastal towns
              </div>
            </div>
          </div>
          <div
            className={`relative ${
              viewport === "mobile" ? "order-1 p-3 pb-0" : "p-3 pl-0"
            }`}
          >
            <div className="h-full overflow-hidden rounded-t-[5rem]">
              <Photo variant="hero" />
            </div>
            <div className="absolute right-6 bottom-6 left-3 rounded-xl bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="text-[7px] font-semibold tracking-wider text-[#193334]/50 uppercase">
                Plan your stay
              </div>
              <div className="mt-2 flex gap-2 text-[8px]">
                <span className="flex-1 border-b border-[#193334]/20 pb-1">
                  Add dates
                </span>
                <span className="flex-1 border-b border-[#193334]/20 pb-1">
                  2 guests
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {section.id === "properties" ? (
        <div className="p-6">
          <div className="max-w-md">
            <div className="text-[7px] font-semibold tracking-[0.22em] text-[#d0663d] uppercase">
              Two ways to coast
            </div>
            <h3 className="mt-2 font-serif text-3xl leading-none">
              {section.proposedTitle}
            </h3>
            <p className="mt-2 text-[9px] text-[#193334]/60">
              {section.proposedBody}
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="relative h-32 overflow-hidden rounded-t-[2.5rem]">
              <Photo variant="home" />
              <span className="absolute bottom-3 left-3 text-sm font-semibold text-white">
                Cannon Beach
              </span>
            </div>
            <div className="relative h-32 overflow-hidden rounded-t-[2.5rem]">
              <Photo variant="coast" />
              <span className="absolute bottom-3 left-3 text-sm font-semibold text-white">
                Manzanita
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#193334]/15 pt-3 text-[8px]">
            <span>11 pet-friendly homes</span>
            <span className="font-semibold">Explore the collection →</span>
          </div>
        </div>
      ) : null}
      {section.id === "trust" ? (
        <div
          className={`grid h-[calc(100%-2.5rem)] ${
            viewport === "mobile"
              ? "grid-rows-[38%_62%]"
              : "grid-cols-[44%_56%]"
          }`}
        >
          <Photo variant="coast" />
          <div className="flex flex-col justify-center p-8">
            <div className="text-[7px] font-semibold tracking-[0.22em] text-[#d0663d] uppercase">
              The Driftwood difference
            </div>
            <h3 className="mt-2 font-serif text-3xl">
              {section.proposedTitle}
            </h3>
            <p className="mt-2 text-[9px] leading-relaxed text-[#193334]/60">
              {section.proposedBody}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-y border-[#193334]/15 py-3 text-[7px]">
              <span>Nearby support</span>
              <span>Thoughtful arrivals</span>
              <span>Direct-book help</span>
            </div>
            <blockquote className="mt-4 font-serif text-[13px] leading-snug">
              “The house felt considered, and the team was there exactly when we
              needed them.”
            </blockquote>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SiteFrame({
  label,
  proposed,
  section,
  viewport,
}: {
  label: string;
  proposed?: boolean;
  section: CompositionSection;
  viewport: Viewport;
}) {
  return (
    <section
      className={`flex-1 ${
        viewport === "mobile" ? "min-w-[300px]" : "min-w-[520px]"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-stone-300 uppercase">
            {label}
          </div>
          <div className="mt-0.5 text-[10px] text-stone-600">
            {proposed ? section.proposedGeometry : section.sourceGeometry}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[8px] font-bold tracking-wider uppercase ${proposed ? "bg-lime-300/10 text-lime-200" : "bg-white/5 text-stone-500"}`}
        >
          {proposed ? section.operation : "source truth"}
        </span>
      </div>
      <div
        className={`mx-auto overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl transition-all ${
          viewport === "mobile"
            ? "h-[540px] w-[300px]"
            : "aspect-[16/10] w-full"
        }`}
      >
        {proposed ? (
          <ProposedSite section={section} viewport={viewport} />
        ) : (
          <SourceSite section={section} viewport={viewport} />
        )}
      </div>
    </section>
  );
}

function Comments({ section }: { section: CompositionSection }) {
  return (
    <aside className="w-[300px] shrink-0">
      <div className="mb-2 text-[10px] font-bold tracking-[0.2em] text-stone-300 uppercase">
        Decision notes
      </div>
      <div className="space-y-3">
        {section.comments.map((comment, index) => (
          <article
            key={comment.id}
            className="rounded-xl border border-amber-300/20 bg-[#1c1914] p-4"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-500 text-[10px] font-bold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="text-xs font-semibold text-stone-100">
                  {comment.title}
                </h3>
                <span className="mt-1 inline-flex rounded bg-white/5 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-stone-500 uppercase">
                  {comment.confidence} confidence
                </span>
              </div>
            </div>
            <div className="mt-4 border-t border-white/8 pt-3">
              <div className="text-[8px] font-bold tracking-wider text-stone-500 uppercase">
                What the reviewer saw
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-stone-300">
                {comment.observation}
              </p>
            </div>
            <div className="mt-3">
              <div className="text-[8px] font-bold tracking-wider text-stone-500 uppercase">
                Applied change
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-stone-300">
                {comment.decision}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {comment.evidence.map((evidence) => (
                <span
                  key={evidence}
                  className="rounded-full border border-white/10 px-2 py-1 text-[8px] text-stone-500"
                >
                  {evidence}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

export function PregenReviewWorkbench() {
  const fixture = PREGEN_REVIEW_FIXTURE;
  const [sectionId, setSectionId] = useState(fixture.sections[0]!.id);
  const [mode, setMode] = useState<ReviewMode>("side-by-side");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [swapProposed, setSwapProposed] = useState(false);
  const [showPipeline, setShowPipeline] = useState(true);
  const [evaluationPipeId, setEvaluationPipeId] =
    useState<EvaluationPipeId>("source-fidelity");

  const section = useMemo(
    () =>
      fixture.sections.find((candidate) => candidate.id === sectionId) ??
      fixture.sections[0]!,
    [fixture.sections, sectionId],
  );
  const evaluationPipe =
    EVALUATION_PIPES.find((pipe) => pipe.id === evaluationPipeId) ??
    EVALUATION_PIPES[0];

  return (
    <main className="min-h-screen bg-[#0b0b0a] text-stone-100">
      <header className="border-b border-white/10 bg-[#0f0f0e] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-lime-300 text-stone-950">
              <FlaskConical className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold">
                  Pregen composition lab
                </h1>
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-bold tracking-widest text-violet-300 uppercase">
                  local fixture
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-stone-500">
                {fixture.prospect.name} · {fixture.prospect.market} ·{" "}
                {fixture.run.id}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              {MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <SegmentButton
                    key={item.id}
                    active={mode === item.id}
                    ariaLabel={`${item.label} review mode`}
                    onClick={() => setMode(item.id)}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </SegmentButton>
                );
              })}
            </div>
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              <SegmentButton
                active={viewport === "desktop"}
                ariaLabel="Desktop preview"
                onClick={() => setViewport("desktop")}
              >
                <Monitor className="size-3.5" />
              </SegmentButton>
              <SegmentButton
                active={viewport === "mobile"}
                ariaLabel="Mobile preview"
                onClick={() => setViewport("mobile")}
              >
                <Smartphone className="size-3.5" />
              </SegmentButton>
            </div>
            <button
              type="button"
              onClick={() => setShowPipeline((value) => !value)}
              aria-expanded={showPipeline}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${showPipeline ? "border-lime-300/40 bg-lime-300/10 text-lime-200" : "border-white/10 bg-white/5 text-stone-300"}`}
            >
              <FileJson2 className="size-3.5" /> Evaluation pipes
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <FlowCard
            number="1"
            title="Monolith"
            detail="Existing production builder and native preview route."
          />
          <FlowCard
            number="2"
            title="Growth-native"
            detail="Current crawl → plan → generate → inject → persist path, with registry previews."
          />
          <FlowCard
            number="3"
            title="Evaluation lab"
            detail="One candidate artifact, independently scored for fidelity, grounding, layout, and editorial value."
            selected
          />
        </div>
      </header>

      {showPipeline ? (
        <section className="border-b border-white/10 bg-[#11110f] px-5 py-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Sparkles className="size-3.5 text-lime-300" /> Candidate
                generation
              </div>
              <p className="mt-1 text-[9px] text-stone-500">
                A linear experimental path produces one immutable candidate
                artifact.
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-[8px] text-stone-600">
              candidate-artifact/v1
            </span>
          </div>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
            {CANDIDATE_PIPELINE.map((step, index) => (
              <div
                key={step.id}
                className="flex min-w-[185px] flex-1 items-center gap-2"
              >
                <div className="h-full flex-1 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-white">
                    <span className="grid size-5 place-items-center rounded-full bg-lime-300/15 text-[9px] text-lime-200">
                      {index + 1}
                    </span>
                    {step.label}
                  </div>
                  <p className="mt-2 text-[9px] leading-relaxed text-stone-500">
                    {step.detail}
                  </p>
                  <div className="mt-3 font-mono text-[8px] text-stone-700">
                    {step.output}
                  </div>
                </div>
                {index < CANDIDATE_PIPELINE.length - 1 ? (
                  <ChevronRight className="size-3 shrink-0 text-stone-700" />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-white/8 pt-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">
                  Independent evaluation pipes
                </div>
                <p className="mt-1 text-[9px] text-stone-500">
                  Every pipe reads the candidate directly and emits its own
                  typed receipt. No evaluator is hidden inside another.
                </p>
              </div>
              <span className="text-[8px] font-bold tracking-[0.18em] text-lime-300 uppercase">
                fan out · compare receipts · human decides
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {EVALUATION_PIPES.map((pipe) => (
                <EvaluationPipeCard
                  key={pipe.id}
                  pipe={pipe}
                  selected={pipe.id === evaluationPipe.id}
                  onSelect={() => setEvaluationPipeId(pipe.id)}
                />
              ))}
            </div>
            <div className="mt-2">
              <EvaluationReceipt pipe={evaluationPipe} />
            </div>
          </div>
        </section>
      ) : null}

      <div className="flex min-h-[720px]">
        <nav className="w-52 shrink-0 border-r border-white/10 bg-[#0f0f0e] p-3">
          <div className="px-2 py-2 text-[9px] font-bold tracking-[0.2em] text-stone-600 uppercase">
            Page sections
          </div>
          <div className="mt-1 space-y-1">
            {fixture.sections.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setSectionId(candidate.id)}
                className={`w-full rounded-xl p-3 text-left transition ${candidate.id === section.id ? "bg-white/10" : "hover:bg-white/5"}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-5 place-items-center rounded-full text-[9px] font-bold ${candidate.id === section.id ? "bg-lime-300 text-stone-950" : "bg-white/5 text-stone-500"}`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${candidate.id === section.id ? "text-white" : "text-stone-400"}`}
                  >
                    {candidate.sourceTitle.split(" ").slice(0, 3).join(" ")}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[8px] tracking-wider text-stone-600 uppercase">
                  <span>{candidate.operation}</span>
                  <span>
                    {candidate.comments.length} note
                    {candidate.comments.length === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-white/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-[9px] font-semibold text-stone-300">
                <Check className="size-3 text-lime-300" /> Active evaluator
              </div>
              <span className="font-mono text-[7px] text-stone-700">
                {evaluationPipe.receipt}
              </span>
            </div>
            <div className="mt-3 text-[10px] font-medium text-stone-200">
              {evaluationPipe.label}
            </div>
            <p className="mt-1 text-[8px] leading-relaxed text-stone-600">
              {evaluationPipe.question}
            </p>
            <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
              {evaluationPipe.checks.map((check) => (
                <div key={check.label} className="flex justify-between gap-3">
                  <span className="text-[8px] text-stone-600">
                    {check.label}
                  </span>
                  <span className="text-right text-[8px] font-medium text-stone-400">
                    {check.result}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 p-3">
            <div className="flex items-center gap-2 text-[9px] font-semibold text-stone-300">
              <Check className="size-3 text-lime-300" /> Section evidence
            </div>
            <div className="mt-3 space-y-2">
              {section.evidence.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                  <div className="text-[9px] font-medium text-stone-300">
                    {item.value}
                  </div>
                  <div className="text-[8px] text-stone-600">{item.origin}</div>
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-x-auto p-5">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="text-[9px] font-bold tracking-[0.22em] text-lime-300 uppercase">
                {section.eyebrow}
              </div>
              <h2 className="mt-1 text-lg font-semibold">
                {section.proposedTitle}
              </h2>
            </div>
            <div className="text-right text-[9px] text-stone-600">
              Fixture only · no production writes
              <br />
              Candidate composition-receipt/v1
              <br />
              Evaluator {evaluationPipe.id}/v1
            </div>
          </div>

          {mode === "side-by-side" ? (
            <div
              className={`flex gap-4 ${
                viewport === "mobile" ? "min-w-[948px]" : "min-w-[1380px]"
              }`}
            >
              <Comments section={section} />
              <SiteFrame label="Source" section={section} viewport={viewport} />
              <SiteFrame
                label="Proposed"
                proposed
                section={section}
                viewport={viewport}
              />
            </div>
          ) : null}
          {mode === "revision" ? (
            <div className="flex min-w-[760px] gap-4">
              <Comments section={section} />
              <SiteFrame
                label="Proposed revision"
                proposed
                section={section}
                viewport={viewport}
              />
            </div>
          ) : null}
          {mode === "swap" ? (
            <div className="mx-auto max-w-5xl">
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setSwapProposed((value) => !value)}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-semibold text-stone-300"
                >
                  <ArrowLeftRight className="size-3" /> Showing{" "}
                  {swapProposed ? "proposed" : "source"} · click to swap
                </button>
              </div>
              <SiteFrame
                label={swapProposed ? "Proposed revision" : "Source"}
                proposed={swapProposed}
                section={section}
                viewport={viewport}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
