"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Camera,
  Check,
  CircleDashed,
  ExternalLink,
  FileJson2,
  FlaskConical,
  Gavel,
  Monitor,
  RefreshCw,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import type { PregenSourceVisualReceipt } from "@/server/services/pregen/source-visual-types";

import type { PregenEvaluationView, PregenLiveRun } from "./pregen-review-data";

type Viewport = "desktop" | "mobile";
type SourceMode = "receipt" | "live";

const STEP_LABELS: Record<string, string> = {
  crawl: "Crawl source",
  plan: "Plan composition",
  generate_sections: "Generate sections",
  inject_properties: "Inject properties",
  persist_artifact: "Persist artifact",
};

export function PregenLiveWorkbench({ run }: { run: PregenLiveRun }) {
  const router = useRouter();
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [sourceMode, setSourceMode] = useState<SourceMode>(
    run.sourceCapture.visualReceipt ? "receipt" : "live",
  );
  const [captureState, setCaptureState] = useState<
    "idle" | "capturing" | "failed"
  >("idle");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [evalState, setEvalState] = useState<"idle" | "running" | "failed">(
    "idle",
  );
  const [evalError, setEvalError] = useState<string | null>(null);
  const rendererLive = run.preview.state === "live";
  const sourceLive = run.sourcePreview.state === "live";
  const sourceReceipt = run.sourceCapture.visualReceipt;
  const selectedCapture = sourceReceipt?.captures.find(
    (capture) => capture.viewport === viewport,
  );
  const frameClass =
    viewport === "mobile" ? "h-[780px] w-[390px]" : "h-[820px] w-[1280px]";

  async function runEvaluations() {
    setEvalState("running");
    setEvalError(null);

    try {
      const response = await fetch("/api/lab/pregen-review/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildId: run.build.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Evaluation failed");
      }
      setEvalState("idle");
      router.refresh();
    } catch (error) {
      setEvalState("failed");
      setEvalError(
        error instanceof Error ? error.message : "Evaluation failed",
      );
    }
  }

  async function captureOriginal() {
    setCaptureState("capturing");
    setCaptureError(null);

    try {
      const response = await fetch("/api/lab/pregen-review/capture-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildId: run.build.id }),
      });
      const result = (await response.json()) as {
        receipt?: unknown;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Source capture failed");
      }
      setCaptureState("idle");
      setSourceMode("receipt");
      router.refresh();
    } catch (error) {
      setCaptureState("failed");
      setCaptureError(
        error instanceof Error ? error.message : "Source capture failed",
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0b0a] text-stone-100">
      <header className="border-b border-white/10 bg-[#0f0f0e] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-lime-300 text-stone-950">
              <FlaskConical className="size-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-semibold">Pregen run workbench</h1>
                <StatusPill tone="lime">persisted run</StatusPill>
                <StatusPill tone={rendererLive ? "lime" : "amber"}>
                  renderer {rendererLive ? "live" : "unavailable"}
                </StatusPill>
              </div>
              <p className="mt-0.5 text-[10px] text-stone-500">
                {run.prospect.name} · {run.prospect.domain} · {run.build.id}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              <ViewportButton
                active={viewport === "desktop"}
                label="Desktop preview"
                onClick={() => setViewport("desktop")}
              >
                <Monitor className="size-3.5" />
              </ViewportButton>
              <ViewportButton
                active={viewport === "mobile"}
                label="Mobile preview"
                onClick={() => setViewport("mobile")}
              >
                <Smartphone className="size-3.5" />
              </ViewportButton>
            </div>
            {run.preview.url && (
              <a
                href={run.preview.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-stone-300 hover:bg-white/10 hover:text-white"
              >
                Open renderer <ExternalLink className="size-3" />
              </a>
            )}
            <button
              type="button"
              onClick={captureOriginal}
              disabled={captureState === "capturing"}
              className="flex items-center gap-2 rounded-xl border border-lime-300/20 bg-lime-300/[0.06] px-3 py-2 text-xs font-medium text-lime-200 hover:bg-lime-300/10 disabled:cursor-wait disabled:opacity-60"
            >
              {captureState === "capturing" ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : (
                <Camera className="size-3" />
              )}
              {sourceReceipt ? "Recapture original" : "Capture original"}
            </button>
            <button
              type="button"
              onClick={runEvaluations}
              disabled={evalState === "running"}
              className="flex items-center gap-2 rounded-xl border border-lime-300/20 bg-lime-300/[0.06] px-3 py-2 text-xs font-medium text-lime-200 hover:bg-lime-300/10 disabled:cursor-wait disabled:opacity-60"
            >
              {evalState === "running" ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : (
                <Gavel className="size-3" />
              )}
              {run.evaluations.length > 0
                ? "Re-run evaluations"
                : "Run evaluations"}
            </button>
          </div>
        </div>

        {captureError ? (
          <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[9px] text-amber-100">
            Capture failed: {captureError}
          </div>
        ) : null}
        {evalError ? (
          <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[9px] text-amber-100">
            Evaluation failed: {evalError}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <SurfaceCard
            number="1"
            title="Growth run"
            detail={`${run.sourceCapture.pageCount} crawl pages · ${run.build.steps.length} completed steps`}
            state="live data"
            active
          />
          <SurfaceCard
            number="2"
            title="Registry renderer"
            detail={`Artifact v${run.artifact.version} · ${run.artifact.sections.length} sections · ${run.extractedPropertyCount} properties`}
            state={rendererLive ? "live surface" : "surface offline"}
            active={rendererLive}
            warning={!rendererLive}
          />
          <SurfaceCard
            number="3"
            title="Evaluation lab"
            detail={
              run.evaluations.length > 0
                ? run.evaluations
                    .map(
                      (receipt) =>
                        `${humanize(receipt.kind)}: ${receipt.status}`,
                    )
                    .join(" · ")
                : "No model, deterministic, or human evaluation receipts exist for this run yet."
            }
            state={
              run.evaluations.length > 0
                ? `${run.evaluations.length} receipts`
                : "not run"
            }
            active={
              run.evaluations.length > 0 &&
              run.evaluations.every((receipt) => receipt.status === "passed")
            }
            warning={run.evaluations.some(
              (receipt) => receipt.status === "failed",
            )}
          />
        </div>
      </header>

      <section className="border-b border-white/10 bg-[#11110f] px-5 py-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <FileJson2 className="size-3.5 text-lime-300" /> Persisted build
              trace
            </div>
            <p className="mt-1 text-[9px] text-stone-500">
              These checkpoints come from the real append-only step log.
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-[8px] text-stone-500">
            {run.artifact.id} · v{run.artifact.version}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          {run.build.steps.map((step, index) => (
            <div
              key={`${step.step}-${step.startedAt}`}
              className="rounded-xl border border-lime-300/20 bg-lime-300/[0.045] p-3"
            >
              <div className="flex items-center gap-2 text-[10px] font-semibold text-white">
                <span className="grid size-5 place-items-center rounded-full bg-lime-300 text-[9px] font-bold text-stone-950">
                  {index + 1}
                </span>
                {STEP_LABELS[step.step] ?? step.step}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(step.stats).map(([label, value]) => (
                  <span
                    key={label}
                    className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[8px] text-stone-400"
                  >
                    {humanize(label)}: {value}
                  </span>
                ))}
              </div>
              <div className="mt-3 font-mono text-[8px] text-stone-600">
                {formatDuration(step.startedAt, step.finishedAt)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {run.evaluations.length > 0 ? (
        <section className="border-b border-white/10 bg-[#0e0e0d] px-5 py-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Gavel className="size-3.5 text-lime-300" /> Evaluation receipts
              </div>
              <p className="mt-1 text-[9px] text-stone-500">
                Independent verdicts on the persisted build. Reruns append;
                these are the newest per kind.
              </p>
            </div>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {run.evaluations.map((receipt) => (
              <EvaluationReceiptDetail key={receipt.id} receipt={receipt} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid min-h-[820px] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-r border-white/10 bg-[#0f0f0e] p-4">
          <div className="text-[9px] font-bold tracking-[0.2em] text-stone-600 uppercase">
            Artifact sections
          </div>
          <div className="mt-3 space-y-1.5">
            {run.artifact.sections.map((section) => (
              <div
                key={section.id}
                className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-3"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-lime-300/15 text-[9px] font-bold text-lime-200">
                  {section.index}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-medium text-stone-300">
                    {section.label}
                  </div>
                  <div className="truncate font-mono text-[7px] text-stone-700">
                    {section.type}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <ReceiptCard title="Source corpus" state="captured" tone="lime">
            <div className="space-y-2">
              {run.sourceCapture.byKind.map((item) => (
                <div key={item.kind} className="flex justify-between gap-3">
                  <span>{humanize(item.kind)}</span>
                  <span className="font-medium text-stone-300">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </ReceiptCard>

          {sourceReceipt ? (
            <ReceiptCard title="Source visual" state="captured" tone="lime">
              <div className="space-y-2">
                <div className="flex justify-between gap-3">
                  <span>Captured</span>
                  <span className="text-right text-stone-300">
                    {formatTimestamp(sourceReceipt.capturedAt)}
                  </span>
                </div>
                {sourceReceipt.captures.map((capture) => (
                  <a
                    key={capture.viewport}
                    href={capture.screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex justify-between gap-3 hover:text-white"
                  >
                    <span>{humanize(capture.viewport)}</span>
                    <span className="text-stone-300">
                      {capture.width} × {capture.height}
                    </span>
                  </a>
                ))}
              </div>
            </ReceiptCard>
          ) : (
            <ReceiptCard
              title="Source visual"
              state="not captured"
              tone="amber"
            >
              Capture the original to preserve desktop/mobile screenshots and a
              measured section inventory for this build.
            </ReceiptCard>
          )}

          {run.evaluations.length > 0 ? (
            <ReceiptCard
              title="Evaluation receipts"
              state={`latest of ${run.evaluations.length}`}
              tone={
                run.evaluations.some((receipt) => receipt.status === "failed")
                  ? "amber"
                  : "lime"
              }
            >
              <div className="space-y-2">
                {run.evaluations.map((receipt) => (
                  <div key={receipt.id} className="flex justify-between gap-3">
                    <span>{humanize(receipt.kind)}</span>
                    <span
                      className={
                        receipt.status === "passed"
                          ? "font-medium text-lime-200"
                          : receipt.status === "failed"
                            ? "font-medium text-amber-200"
                            : "font-medium text-stone-300"
                      }
                    >
                      {humanize(receipt.status)}
                    </span>
                  </div>
                ))}
              </div>
            </ReceiptCard>
          ) : (
            <ReceiptCard
              title="Evaluation receipts"
              state="not run"
              tone="stone"
            >
              Run evaluations to append immutable grounding, image-provenance,
              and source-fidelity receipts for this build.
            </ReceiptCard>
          )}
        </aside>

        <section className="min-w-0 overflow-x-auto p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[9px] font-bold tracking-[0.22em] text-lime-300 uppercase">
                Generated candidate
              </div>
              <h2 className="mt-1 text-lg font-semibold">
                Actual Pregen Preview
              </h2>
              <p className="mt-1 text-[10px] text-stone-500">
                Rendered by the standalone Astro app from the persisted registry
                artifact.
              </p>
            </div>
            <div className="text-right font-mono text-[8px] text-stone-600">
              build {run.build.id}
              <br />
              artifact {run.artifact.id} · version {run.artifact.version}
              <br />
              read-only · no evaluation writes
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-white/10 bg-white/[0.025] p-1">
              <SourceModeButton
                active={sourceMode === "receipt"}
                disabled={!sourceReceipt}
                onClick={() => setSourceMode("receipt")}
              >
                Captured original
              </SourceModeButton>
              <SourceModeButton
                active={sourceMode === "live"}
                disabled={!sourceLive}
                onClick={() => setSourceMode("live")}
              >
                Current live site
              </SourceModeButton>
            </div>
            <p className="max-w-xl text-right text-[9px] leading-relaxed text-stone-600">
              The receipt is reproducible evidence. The live iframe is useful
              for inspection, but can change after the build.
            </p>
          </div>

          <div className="flex min-w-max items-start gap-4 pb-2">
            <div
              className={`shrink-0 ${
                viewport === "mobile" ? "w-[390px]" : "w-[1280px]"
              }`}
            >
              <FrameLabel
                label="Source"
                detail={
                  sourceMode === "receipt"
                    ? `${viewport} immutable visual receipt`
                    : `${viewport} current source · not an immutable receipt`
                }
                badge={
                  sourceMode === "receipt"
                    ? "captured original"
                    : sourceLive
                      ? "live original"
                      : run.sourcePreview.state
                }
                active={
                  sourceMode === "receipt"
                    ? Boolean(selectedCapture)
                    : sourceLive
                }
              />
              {sourceMode === "receipt" && selectedCapture ? (
                <div
                  className={`overflow-y-auto rounded-xl border border-lime-300/20 bg-white shadow-2xl ${frameClass}`}
                >
                  <Image
                    src={selectedCapture.screenshotUrl}
                    alt={`${run.prospect.name} ${viewport} source capture`}
                    width={selectedCapture.geometry.document.width}
                    height={selectedCapture.geometry.document.height}
                    unoptimized
                    className="h-auto w-full"
                  />
                </div>
              ) : sourceLive ? (
                <iframe
                  key={`source-${viewport}`}
                  title={`${run.prospect.name} live source`}
                  src={run.sourcePreview.url}
                  referrerPolicy="no-referrer"
                  sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                  className={`rounded-xl border border-lime-300/20 bg-white shadow-2xl ${frameClass}`}
                />
              ) : (
                <div
                  className={`flex flex-col justify-between rounded-xl border border-dashed border-amber-300/25 bg-amber-300/[0.025] p-6 ${frameClass}`}
                >
                  <div className="max-w-md">
                    <TriangleAlert className="size-5 text-amber-300" />
                    <h3 className="mt-4 text-sm font-semibold text-stone-200">
                      Live source cannot be embedded
                    </h3>
                    <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
                      {run.sourcePreview.state === "blocked"
                        ? "The source advertises a framing policy, so the workbench will not pretend the live page is available here."
                        : "The source did not respond to the workbench probe. The persisted crawl corpus remains available."}
                    </p>
                  </div>
                  <div className="max-w-md">
                    <div className="space-y-2 border-t border-white/8 pt-4 text-[9px] text-stone-500">
                      <div className="flex justify-between">
                        <span>Crawl pages</span>
                        <span className="text-stone-300">
                          {run.sourceCapture.pageCount}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Source domain</span>
                        <span className="text-stone-300">
                          {run.prospect.domain}
                        </span>
                      </div>
                    </div>
                    <a
                      href={run.sourcePreview.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-medium text-stone-400 hover:bg-white/5 hover:text-white"
                    >
                      Open current source <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className={viewport === "mobile" ? "w-[390px]" : "w-[1280px]"}>
              <FrameLabel
                label="Generated candidate"
                detail={`${viewport} registry render`}
                badge={rendererLive ? "live surface" : "unavailable"}
                active={rendererLive}
              />
              {rendererLive ? (
                <iframe
                  key={viewport}
                  title={`${run.prospect.name} generated preview`}
                  src={run.preview.url ?? undefined}
                  referrerPolicy="no-referrer"
                  className={`rounded-xl border border-white/10 bg-white shadow-2xl ${frameClass}`}
                />
              ) : (
                <div
                  className={`grid place-items-center rounded-xl border border-dashed border-amber-300/25 bg-amber-300/[0.025] ${frameClass}`}
                >
                  <div className="max-w-sm p-8 text-center">
                    <CircleDashed className="mx-auto size-6 text-amber-300" />
                    <h3 className="mt-4 text-sm font-semibold">
                      {run.preview.state === "unconfigured"
                        ? "No preview host configured"
                        : "Preview renderer unavailable"}
                    </h3>
                    <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
                      {run.preview.state === "unconfigured"
                        ? "Previews are served per prospect at <label>.<zone>. Set PREGEN_PREVIEW_HOST_ZONE and refresh."
                        : "The renderer did not answer for this prospect. Refresh this exact run URL. The workbench will not replace it with a fixture."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <SourceStoryboard
            capture={selectedCapture ?? null}
            sourceUrl={sourceReceipt?.finalUrl ?? run.prospect.sourceUrl}
          />
        </section>
      </div>
    </main>
  );
}

function SourceModeButton({
  active,
  disabled,
  children,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[9px] font-medium transition ${
        active
          ? "bg-white text-stone-950 shadow-sm"
          : "text-stone-500 hover:bg-white/5 hover:text-stone-300 disabled:cursor-not-allowed disabled:opacity-35"
      }`}
    >
      {children}
    </button>
  );
}

function SourceStoryboard({
  capture,
  sourceUrl,
}: {
  capture: PregenSourceVisualReceipt["captures"][number] | null;
  sourceUrl: string;
}) {
  if (!capture) {
    return (
      <div className="mt-8 min-w-[900px] rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-6">
        <div className="text-[9px] font-bold tracking-[0.22em] text-stone-600 uppercase">
          Original site storyboard
        </div>
        <p className="mt-3 max-w-xl text-[10px] leading-relaxed text-stone-500">
          Capture the original to turn its measured page sections into a durable
          storyboard artifact.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-8 min-w-[1180px] rounded-2xl border border-white/10 bg-[#0f0f0e] p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[9px] font-bold tracking-[0.22em] text-lime-300 uppercase">
            Original site storyboard
          </div>
          <h3 className="mt-1 text-sm font-semibold">
            Measured structure of the captured source
          </h3>
          <p className="mt-1 text-[9px] text-stone-500">
            DOM geometry from the same {capture.viewport} session as the source
            screenshot. This is evidence, not an inferred content plan.
          </p>
        </div>
        <div className="text-right font-mono text-[8px] text-stone-600">
          {capture.geometry.document.width} × {capture.geometry.document.height}
          <br />
          {capture.geometry.sections.length} measured sections · {sourceUrl}
        </div>
      </div>

      <div className="mt-5 flex min-w-max items-stretch gap-2 overflow-x-auto pb-2">
        {capture.geometry.sections.map((section) => (
          <article
            key={`${section.index}-${section.y}-${section.label}`}
            className="flex w-[210px] shrink-0 flex-col rounded-xl border border-white/8 bg-white/[0.025] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-lime-300/15 text-[8px] font-bold text-lime-200">
                {section.index + 1}
              </span>
              <span className="font-mono text-[7px] text-stone-600">
                y {section.y}px
              </span>
              <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 font-mono text-[7px] text-stone-500">
                {section.tag}
              </span>
            </div>
            <h4 className="mt-3 line-clamp-3 text-[10px] leading-relaxed font-medium text-stone-200">
              {section.label || `Untitled ${humanize(section.tag)}`}
            </h4>
            <div className="mt-auto pt-5">
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-lime-300/60"
                  style={{
                    width: `${Math.max(
                      5,
                      Math.min(
                        100,
                        (section.height / capture.geometry.document.height) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-1 text-center font-mono text-[7px] text-stone-600">
                <span>{section.headingCount} heads</span>
                <span>{section.imageCount} media</span>
                <span>{section.linkCount} links</span>
              </div>
              <div className="mt-2 text-[8px] text-stone-500">
                {section.width} × {section.height}px
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvaluationReceiptDetail({
  receipt,
}: {
  receipt: PregenEvaluationView;
}) {
  const statusTone =
    receipt.status === "passed"
      ? "border-lime-300/25 bg-lime-300/[0.05]"
      : receipt.status === "failed"
        ? "border-amber-300/30 bg-amber-300/[0.05]"
        : "border-white/12 bg-white/[0.03]";

  return (
    <article className={`rounded-xl border p-4 ${statusTone}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-white">
          {humanize(receipt.kind)}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[8px] font-bold tracking-widest uppercase ${
            receipt.status === "passed"
              ? "bg-lime-300/15 text-lime-200"
              : receipt.status === "failed"
                ? "bg-amber-300/20 text-amber-200"
                : "bg-white/10 text-stone-300"
          }`}
        >
          {humanize(receipt.status)}
        </span>
        <span className="ml-auto font-mono text-[7px] text-stone-600">
          {receipt.evaluatorName}/{receipt.evaluatorVersion}
          {receipt.model ? ` · ${receipt.model}` : ""}
        </span>
      </div>
      <div className="mt-1 text-[8px] text-stone-600">
        {humanize(receipt.evaluatorType)} evaluator ·{" "}
        {formatTimestamp(receipt.createdAt)}
      </div>
      <div className="mt-3 space-y-2 text-[9px] leading-relaxed text-stone-400">
        <ReceiptResultSummary receipt={receipt} />
      </div>
    </article>
  );
}

const asCount = (value: unknown): number =>
  typeof value === "number" ? value : 0;
const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

function ReceiptResultSummary({ receipt }: { receipt: PregenEvaluationView }) {
  const result = receipt.result;

  if (result.skipped === true) {
    return <p>Skipped: {asText(result.reason) || "no reason recorded"}</p>;
  }

  if (receipt.kind === "grounding") {
    const claims = Array.isArray(result.claims)
      ? (result.claims as Array<{
          subject: string;
          claim: string;
          value: string;
          grounded: boolean;
          severity: string;
        }>)
      : [];
    const ungrounded = claims.filter((claim) => !claim.grounded);
    return (
      <>
        <p>
          {asCount(result.groundedCount)} of {asCount(result.claimCount)}{" "}
          numeric claims trace to the crawl corpus.
        </p>
        {ungrounded.slice(0, 6).map((claim, index) => (
          <p key={index} className="text-amber-200/90">
            {claim.severity === "hard" ? "✗" : "▲"} {claim.subject}:{" "}
            {claim.claim} {claim.value} not found in source
          </p>
        ))}
        {ungrounded.length > 6 ? (
          <p className="text-stone-600">
            +{ungrounded.length - 6} more ungrounded claims in the stored
            receipt
          </p>
        ) : null}
      </>
    );
  }

  if (receipt.kind === "image_selection") {
    const unknown = Array.isArray(result.unknownProvenance)
      ? (result.unknownProvenance as string[])
      : [];
    return (
      <>
        <p>
          {asCount(result.imageCount)} rendered images ·{" "}
          {asCount(result.placeholderCount)} placeholders ·{" "}
          {asCount(result.unknownProvenanceCount)} without source provenance.
        </p>
        {unknown.slice(0, 3).map((url) => (
          <p
            key={url}
            className="truncate font-mono text-[7px] text-amber-200/80"
          >
            {url}
          </p>
        ))}
      </>
    );
  }

  if (receipt.kind === "source_fidelity") {
    const findings = Array.isArray(result.findings)
      ? (result.findings as Array<{
          excerpt: string;
          issue: string;
          severity: string;
        }>)
      : [];
    return (
      <>
        <p>{asText(result.summary)}</p>
        {findings.slice(0, 4).map((finding, index) => (
          <p
            key={index}
            className={
              finding.severity === "major"
                ? "text-amber-200/90"
                : "text-stone-400"
            }
          >
            [{finding.severity}] “{finding.excerpt}” — {finding.issue}
          </p>
        ))}
        {findings.length > 4 ? (
          <p className="text-stone-600">
            +{findings.length - 4} more findings in the stored receipt
          </p>
        ) : null}
      </>
    );
  }

  return <p>Receipt stored; open the database row for full detail.</p>;
}

function ViewportButton({
  active,
  label,
  children,
  onClick,
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 transition ${
        active
          ? "bg-white text-stone-950 shadow-sm"
          : "text-stone-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "lime" | "amber";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[8px] font-bold tracking-widest uppercase ${
        tone === "lime"
          ? "bg-lime-300/15 text-lime-200"
          : "bg-amber-300/15 text-amber-200"
      }`}
    >
      {children}
    </span>
  );
}

function SurfaceCard({
  number,
  title,
  detail,
  state,
  active,
  warning,
}: {
  number: string;
  title: string;
  detail: string;
  state: string;
  active?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        active
          ? "border-lime-300/40 bg-lime-300/[0.06]"
          : warning
            ? "border-amber-300/30 bg-amber-300/[0.04]"
            : "border-white/10 bg-white/[0.025]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid size-5 place-items-center rounded-full text-[9px] font-bold ${
            active
              ? "bg-lime-300 text-stone-950"
              : warning
                ? "bg-amber-300/15 text-amber-200"
                : "bg-white/5 text-stone-500"
          }`}
        >
          {number}
        </span>
        <span className="text-[10px] font-semibold text-white">{title}</span>
        <span className="ml-auto text-[8px] font-bold tracking-wider text-stone-500 uppercase">
          {state}
        </span>
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-stone-500">{detail}</p>
    </div>
  );
}

function ReceiptCard({
  title,
  state,
  tone,
  children,
}: {
  title: string;
  state: string;
  tone: "lime" | "amber" | "stone";
  children: React.ReactNode;
}) {
  const toneClass = {
    lime: "border-lime-300/20 bg-lime-300/[0.035]",
    amber: "border-amber-300/20 bg-amber-300/[0.025]",
    stone: "border-white/10 bg-white/[0.02]",
  }[tone];

  return (
    <div className={`mt-3 rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2">
        {tone === "lime" ? (
          <Check className="size-3 text-lime-300" />
        ) : tone === "amber" ? (
          <TriangleAlert className="size-3 text-amber-300" />
        ) : (
          <CircleDashed className="size-3 text-stone-500" />
        )}
        <span className="text-[9px] font-semibold text-stone-300">{title}</span>
        <span className="ml-auto text-[7px] font-bold tracking-wider text-stone-600 uppercase">
          {state}
        </span>
      </div>
      <div className="mt-3 text-[8px] leading-relaxed text-stone-500">
        {children}
      </div>
    </div>
  );
}

function FrameLabel({
  label,
  detail,
  badge,
  active,
}: {
  label: string;
  detail: string;
  badge: string;
  active?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <div>
        <div className="text-[10px] font-bold tracking-[0.2em] text-stone-300 uppercase">
          {label}
        </div>
        <div className="mt-0.5 text-[9px] text-stone-600">{detail}</div>
      </div>
      <span
        className={`rounded-full px-2 py-1 text-[8px] font-bold tracking-wider uppercase ${
          active ? "bg-lime-300/10 text-lime-200" : "bg-white/5 text-stone-500"
        }`}
      >
        {badge}
      </span>
    </div>
  );
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "incomplete";
  const durationMs =
    new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${seconds}s`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
