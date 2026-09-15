"use client";

/* oxlint-disable nextjs/no-img-element -- analysis boards are dynamic R2 URLs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  Bot,
  Grid2X2,
  Images,
  Play,
  ScanSearch,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import {
  renderVideoStoryboard,
  type StoryboardProgress,
} from "@/lib/video-storyboard";
import { useTRPC } from "@/trpc/react";
import type { V5Entry } from "./V5Client";

export const VIDEO_DETAIL_VIEWS = [
  "video",
  "carousel",
  "grid",
  "transcript",
  "analysis",
] as const;
export type VideoDetailView = (typeof VIDEO_DETAIL_VIEWS)[number];

type Board = {
  index: number;
  url: string;
  pathname: string;
  width: number;
  height: number;
  firstFrame: number;
  lastFrame: number;
};

type Frame = {
  index: number;
  timestampMs: number;
  boardIndex: number;
  row: number;
  column: number;
};

type CreativeAnalysis = {
  summary?: string;
  hook?: string;
  structure?: string;
  pacing?: string;
  visualStyle?: string;
  keyBeats?: Array<{
    frameNumber: number;
    role: string;
    description: string;
  }>;
  reusableLessons?: string[];
};

function FrameCrop({
  board,
  frame,
  gridSize,
  onClick,
}: {
  board: Board;
  frame: Frame;
  gridSize: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <img
        src={board.url}
        alt={`Frame ${frame.index}`}
        className="pointer-events-none absolute max-w-none"
        style={{
          width: `${gridSize * 100}%`,
          height: `${gridSize * 100}%`,
          left: `${-frame.column * 100}%`,
          top: `${-frame.row * 100}%`,
        }}
      />
      <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
        {frame.index} · {(frame.timestampMs / 1_000).toFixed(1)}s
      </span>
    </>
  );
  const style = { aspectRatio: `${board.width} / ${board.height}` };
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-lg bg-black text-left"
      style={style}
    >
      {content}
    </button>
  ) : (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={style}
    >
      {content}
    </div>
  );
}

const VIEW_BUTTONS: Array<{
  value: VideoDetailView;
  label: string;
  icon: typeof Play;
}> = [
  { value: "video", label: "Video", icon: Play },
  { value: "carousel", label: "Carousel", icon: Images },
  { value: "grid", label: "Grid", icon: Grid2X2 },
  { value: "transcript", label: "Transcript", icon: AlignLeft },
  { value: "analysis", label: "Analysis", icon: Bot },
];

export function VideoAnalysisWorkspace({
  entry,
  mediaIndex,
  view,
  action,
  onViewChange,
  onActionConsumed,
}: {
  entry: V5Entry;
  mediaIndex: number;
  view: VideoDetailView;
  action: string | null;
  onViewChange: (view: VideoDetailView) => void;
  onActionConsumed: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const automaticRun = useRef<string | null>(null);
  const [progress, setProgress] = useState<StoryboardProgress | null>(null);
  const [pendingSeekMs, setPendingSeekMs] = useState<number | null>(null);
  const media = entry.media[mediaIndex];
  const queryOptions = trpc.media.videoAnalysis.queryOptions({
    platformPostId: entry.id,
    mediaIndex,
  });
  const analysisQuery = useQuery(queryOptions);
  const prepare = useMutation(
    trpc.media.prepareVideoAnalysis.mutationOptions(),
  );
  const saveRender = useMutation(
    trpc.media.saveVideoAnalysisRender.mutationOptions(),
  );
  const complete = useMutation(
    trpc.media.completeVideoAnalysis.mutationOptions(),
  );
  const busy = prepare.isPending || saveRender.isPending || complete.isPending;
  const analysis = analysisQuery.data;
  const boards = useMemo<Board[]>(
    () => analysis?.boards ?? [],
    [analysis?.boards],
  );
  const frames = useMemo<Frame[]>(
    () => analysis?.frames ?? [],
    [analysis?.frames],
  );
  const gridSize = analysis?.gridSize ?? 3;
  const creative: CreativeAnalysis | null = analysis?.analysis ?? null;

  const refreshAnalysis = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryOptions.queryKey }),
    [queryClient, queryOptions.queryKey],
  );

  const runAnalysis = useCallback(async () => {
    try {
      onActionConsumed();
      setProgress({
        stage: "loading",
        progress: 0.01,
        message: "Making the source video durable…",
      });
      const prepared = await prepare.mutateAsync({
        platformPostId: entry.id,
        mediaIndex,
      });
      let current = prepared.analysis;
      if (current.status === "ready") {
        await refreshAnalysis();
        onViewChange("grid");
        return;
      }

      if (!current.boards?.length) {
        const rendered = await renderVideoStoryboard(
          current.sourceUrl,
          setProgress,
        );
        setProgress({
          stage: "composing",
          progress: 0.99,
          message: "Saving storyboard boards to R2…",
        });
        const uploadedBoards: Board[] = [];
        for (const board of rendered.boards) {
          const presign = await fetch("/api/media/video-analysis-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              analysisId: current.id,
              boardIndex: board.index,
            }),
          });
          const presigned = (await presign.json().catch(() => null)) as {
            uploadUrl?: string;
            url?: string;
            pathname?: string;
            error?: string;
          } | null;
          if (
            !presign.ok ||
            !presigned?.uploadUrl ||
            !presigned.url ||
            !presigned.pathname
          ) {
            throw new Error(
              presigned?.error ?? "Could not presign board upload",
            );
          }
          const { uploadUrl, url, pathname } = presigned;
          const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            body: board.blob,
          });
          if (!put.ok) throw new Error(`Board upload failed (${put.status})`);
          uploadedBoards.push({
            index: board.index,
            url,
            pathname,
            width: board.width,
            height: board.height,
            firstFrame: board.firstFrame,
            lastFrame: board.lastFrame,
          });
        }
        current = await saveRender.mutateAsync({
          analysisId: current.id,
          durationMs: rendered.durationMs,
          sampleIntervalMs: rendered.sampleIntervalMs,
          gridSize: rendered.gridSize,
          boards: uploadedBoards,
          frames: rendered.frames,
        });
        await refreshAnalysis();
        onViewChange("grid");
      }

      setProgress({
        stage: "transcribing",
        progress: 0.5,
        message: "Transcribing with OpenAI and saving creative analysis…",
      });
      await complete.mutateAsync({
        analysisId: current.id,
      });
      await refreshAnalysis();
      toast.success("Reel analysis saved permanently");
      onViewChange("analysis");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Video analysis failed",
      );
    } finally {
      setProgress(null);
    }
  }, [
    complete,
    entry.id,
    mediaIndex,
    onActionConsumed,
    onViewChange,
    prepare,
    refreshAnalysis,
    saveRender,
  ]);

  useEffect(() => {
    if (action !== "analyze") return;
    const key = `${entry.id}:${mediaIndex}`;
    if (automaticRun.current === key) return;
    automaticRun.current = key;
    void runAnalysis();
  }, [action, entry.id, mediaIndex, runAnalysis]);

  useEffect(() => {
    if (view !== "video" || pendingSeekMs === null || !videoRef.current) return;
    videoRef.current.currentTime = pendingSeekMs / 1_000;
    void videoRef.current.play().catch(() => undefined);
    setPendingSeekMs(null);
  }, [pendingSeekMs, view]);

  const frameByIndex = useMemo(
    () => new Map(frames.map((frame) => [frame.index, frame])),
    [frames],
  );

  if (media?.type !== "video") return null;

  const seekToFrame = (frame: Frame) => {
    setPendingSeekMs(frame.timestampMs);
    onViewChange("video");
  };

  const retryTranscript = async () => {
    if (!analysis) return;
    try {
      setProgress({
        stage: "transcribing",
        progress: 0.5,
        message: "Transcribing with OpenAI and refreshing analysis…",
      });
      await complete.mutateAsync({
        analysisId: analysis.id,
      });
      await refreshAnalysis();
      toast.success("Transcript saved permanently");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Local transcription failed",
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Reel workspace</p>
          <p className="text-xs text-muted-foreground">
            Browser-local frames · permanent derived artifacts
          </p>
        </div>
        <div className="flex flex-wrap rounded-md border p-0.5">
          {VIEW_BUTTONS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={view === value ? "secondary" : "ghost"}
              size="sm"
              disabled={value !== "video" && !boards.length}

              onClick={() => onViewChange(value)}
            >
              <Icon className="size-3.5" /> {label}
            </Button>
          ))}
        </div>
      </div>

      {progress && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span>{progress.message}</span>
            <span className="font-mono text-muted-foreground">
              {Math.round(progress.progress * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${progress.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {view === "video" && (
        <div className="space-y-3">
          <video
            ref={videoRef}
            src={analysis?.sourceUrl ?? media.url}
            poster={media.thumbnail ?? undefined}
            controls
            playsInline
            className="max-h-[66vh] w-full rounded-lg bg-black object-contain"
          />
          {!analysis?.artifactsSavedAt && (
            <Button
              className="w-full"
              loading={busy}
              onClick={() => void runAnalysis()}
            >
              <ScanSearch className="size-4" /> Analyze reel
            </Button>
          )}
        </div>
      )}

      {view === "carousel" && boards.length > 0 && (
        <Carousel opts={{ loop: frames.length > 1 }} className="mx-10">
          <CarouselContent>
            {frames.map((frame) => {
              const board = boards[frame.boardIndex];
              if (!board) return null;
              return (
                <CarouselItem key={frame.index}>
                  <FrameCrop
                    board={board}
                    frame={frame}
                    gridSize={gridSize}
                    onClick={() => seekToFrame(frame)}
                  />
                </CarouselItem>
              );
            })}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      )}

      {view === "grid" && boards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {frames.map((frame) => {
            const board = boards[frame.boardIndex];
            if (!board) return null;
            return (
              <FrameCrop
                key={frame.index}
                board={board}
                frame={frame}
                gridSize={gridSize}
                onClick={() => seekToFrame(frame)}
              />
            );
          })}
        </div>
      )}

      {view === "transcript" && (
        <div className="rounded-xl border p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
            Transcript{" "}
            {analysis?.transcriptLanguage
              ? `· ${analysis.transcriptLanguage}`
              : ""}
          </p>
          {analysis?.transcriptWords?.length ? (
            <div className="flex flex-wrap gap-x-1.5 gap-y-2 text-sm leading-relaxed">
              {analysis.transcriptWords.map((word, index) => (
                <button
                  key={`${word.startMs}-${index}`}
                  className="rounded px-0.5 hover:bg-accent"
                  onClick={() => {
                    setPendingSeekMs(word.startMs);
                    onViewChange("video");
                  }}
                  title={`${(word.startMs / 1_000).toFixed(1)}s`}
                >
                  {word.text}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No transcript is saved yet. The storyboard remains fully
                available.
              </p>
              {analysis?.transcriptError && (
                <p className="text-xs text-amber-500">
                  {analysis.transcriptError}
                </p>
              )}
              {analysis && (
                <Button
                  variant="outline"
                  loading={complete.isPending || Boolean(progress)}
                  onClick={() => void retryTranscript()}
                >
                  Transcribe with OpenAI
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {view === "analysis" && (
        <div className="space-y-4 rounded-xl border p-4">
          {analysis?.error && !creative && (
            <p className="text-sm text-amber-500">{analysis.error}</p>
          )}
          {creative ? (
            <>
              {[
                ["Summary", creative.summary],
                ["Hook", creative.hook],
                ["Structure", creative.structure],
                ["Pacing", creative.pacing],
                ["Visual style", creative.visualStyle],
              ].map(([label, value]) =>
                value ? (
                  <section key={label}>
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      {label}
                    </p>
                    <p className="mt-1 text-sm">{value}</p>
                  </section>
                ) : null,
              )}
              {!!creative.keyBeats?.length && (
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Key beats
                  </p>
                  <div className="mt-2 space-y-2">
                    {creative.keyBeats.map((beat, index) => {
                      const frame = frameByIndex.get(beat.frameNumber);
                      return (
                        <button
                          key={`${beat.frameNumber}-${index}`}
                          className={cn(
                            "block w-full rounded-lg border p-3 text-left hover:bg-accent",
                            !frame && "pointer-events-none",
                          )}
                          onClick={() => frame && seekToFrame(frame)}
                        >
                          <span className="font-mono text-xs text-emerald-500">
                            Frame {beat.frameNumber} · {beat.role}
                          </span>
                          <p className="mt-1 text-sm">{beat.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              {!!creative.reusableLessons?.length && (
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Reusable lessons
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {creative.reusableLessons.map((lesson) => (
                      <li key={lesson} className="flex gap-2">
                        <span className="text-emerald-500">•</span>
                        <span>{lesson}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Creative analysis will appear after the browser finishes the
              storyboard and local transcript.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
