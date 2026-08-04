"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  NORTH_TOPSAIL_COMPOSITION,
  NORTH_TOPSAIL_CONNECTORS,
  NORTH_TOPSAIL_SCENES,
  type ShowcaseConnector,
} from "./composition";

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function background(imageUrl: string) {
  return { backgroundImage: `url(${imageUrl})` };
}

function SeamCard({ connector }: { connector: ShowcaseConnector }) {
  const from = NORTH_TOPSAIL_SCENES.find(
    (scene) => scene.id === connector.fromSceneId,
  )!;
  const to = NORTH_TOPSAIL_SCENES.find(
    (scene) => scene.id === connector.toSceneId,
  )!;

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055]">
      <div className="grid aspect-[16/8] grid-cols-2 gap-px bg-white/10">
        <div className="bg-cover bg-center" style={background(from.imageUrl)} />
        <div className="bg-cover bg-center" style={background(to.imageUrl)} />
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-cyan-200 uppercase">
              {from.imageId} → {to.imageId}
            </p>
            <h3 className="mt-2 text-xl font-medium">{connector.title}</h3>
          </div>
          <span className="rounded-full border border-amber-200/25 bg-amber-100/10 px-3 py-1 text-[10px] font-medium text-amber-100">
            Planned
          </span>
        </div>
        <p className="text-sm leading-6 text-white/70">{connector.prompt}</p>
        <p className="border-l border-amber-200/40 pl-3 text-xs leading-5 text-amber-100/70">
          Review risk: {connector.risk}
        </p>
      </div>
    </article>
  );
}

export function PropertyShowcaseLab() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    let frameId = 0;
    const updateProgress = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const element = scrollerRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const distance = Math.max(1, element.offsetHeight - window.innerHeight);
        const progress = clamp(-rect.top / distance);
        const video = videoRef.current;

        setOverallProgress(progress);
        if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          if (reducedMotion) {
            video.currentTime = 0;
          } else {
            const duration = Number.isFinite(video.duration)
              ? video.duration
              : NORTH_TOPSAIL_COMPOSITION.generatedDemo.durationSeconds;
            video.currentTime = progress * Math.max(0, duration - 0.04);
          }
        }
      });
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [reducedMotion, videoReady]);

  const currentSeconds =
    overallProgress * NORTH_TOPSAIL_COMPOSITION.generatedDemo.durationSeconds;
  const chapter =
    currentSeconds < 5
      ? "Find the rooftop terrace"
      : currentSeconds < 10
        ? "Cross the red threshold"
        : currentSeconds < 15
          ? "Descend the staircase"
          : "Enter the living room";

  return (
    <main className="min-h-screen bg-[#07131b] text-white">
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/lab"
          className="text-xs font-medium text-white/60 hover:text-white"
        >
          ← Lab
        </Link>
        <div className="flex items-center gap-2 text-[10px] font-medium tracking-[0.14em] uppercase">
          <span className="rounded-full bg-cyan-200 px-2.5 py-1 text-slate-950">
            Generated flight
          </span>
          <span className="hidden text-white/45 sm:inline">
            Kling O3 + Seedance 2
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pt-12 pb-16 text-center sm:px-8 sm:pt-20 sm:pb-24">
        <p className="text-xs font-semibold tracking-[0.24em] text-cyan-200 uppercase">
          Wander North Topsail Beach
        </p>
        <h1 className="mx-auto mt-5 max-w-4xl text-5xl leading-[0.94] font-medium tracking-[-0.055em] sm:text-7xl lg:text-8xl">
          What if the gallery became a place you could fly through?
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
          A real generated camera journey from the rooftop terrace, through the
          red door, down an invented but property-grounded staircase, and into
          the photographed living room.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-2 text-xs text-white/65">
          {[
            `${NORTH_TOPSAIL_COMPOSITION.acquisition.indexedImages} indexed images`,
            `${NORTH_TOPSAIL_COMPOSITION.acquisition.imggridBoards} ImgGrid boards`,
            `${NORTH_TOPSAIL_COMPOSITION.generatedDemo.durationSeconds}s generated flight`,
            `$${NORTH_TOPSAIL_COMPOSITION.generatedDemo.estimatedSpendUsd.toFixed(2)} model spend`,
            "0 decode errors",
          ].map((label) => (
            <span
              key={label}
              className="rounded-full border border-white/10 px-3 py-1.5"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-14 text-center sm:px-8 sm:pb-20">
        <p className="text-xs font-semibold tracking-[0.2em] text-cyan-200 uppercase">
          Scroll to fly
        </p>
        <h2 className="mt-4 text-4xl font-medium tracking-[-0.04em] sm:text-6xl">
          You control the camera now
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-white/55">
          Scroll down to move from the rooftop into the living room. Scroll back
          up to reverse the flight and inspect any transition.
        </p>
      </section>

      <div
        ref={scrollerRef}
        className="relative"
        style={{
          height: `${NORTH_TOPSAIL_COMPOSITION.generatedDemo.durationSeconds * 30}vh`,
        }}
      >
        <div className="sticky top-0 h-screen overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={NORTH_TOPSAIL_COMPOSITION.generatedDemo.videoUrl}
            poster={NORTH_TOPSAIL_COMPOSITION.generatedDemo.posterUrl}
            muted
            playsInline
            controls={reducedMotion}
            preload="auto"
            aria-label="Scroll-controlled AI flight from the rooftop terrace to the living room"
            onLoadedMetadata={() => setVideoReady(true)}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.42),transparent_30%,transparent_60%,rgba(0,0,0,.82))]" />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5 sm:p-8">
            <span className="rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[10px] font-medium tracking-[0.12em] uppercase backdrop-blur-md">
              {reducedMotion ? "Press play" : "Scroll-controlled AI video"}
            </span>
            <span className="rounded-full bg-black/35 px-3 py-1.5 font-mono text-[10px] text-white/75 backdrop-blur-md">
              {currentSeconds.toFixed(1)}s /{" "}
              {NORTH_TOPSAIL_COMPOSITION.generatedDemo.durationSeconds}s
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <div className="mx-auto max-w-7xl">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-cyan-200 uppercase">
                Rooftop → stairwell → living room
              </p>
              <h2 className="mt-2 max-w-3xl text-3xl font-medium tracking-[-0.035em] sm:text-5xl">
                {chapter}
              </h2>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/20">
                  <div
                    className="h-px bg-cyan-200"
                    style={{ width: `${overallProgress * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-white/50">
                  {Math.round(overallProgress * 100)}%
                </span>
              </div>
              {reducedMotion && (
                <p className="mt-3 text-xs text-white/55">
                  Reduced motion is active. Use the video controls to play the
                  flight instead.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-4xl px-5 pt-24 text-center sm:px-8 sm:pt-32">
        <p className="text-xs font-semibold tracking-[0.2em] text-cyan-200 uppercase">
          Composition apparatus
        </p>
        <h2 className="mt-4 text-4xl font-medium tracking-[-0.04em] sm:text-6xl">
          The storyboard underneath the flight
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-white/55">
          Four first/last-frame clips make up the continuous move. The doorway
          came from a Kling versus Seedance bakeoff; two missing stair frames
          were generated from the real property photographs.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-xs leading-5 text-white/40">
          The stair connection is a generated interpretation because the source
          gallery does not photograph the rooftop stairwell interior.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan-200 uppercase">
            The seams are the experiment
          </p>
          <h2 className="mt-4 text-4xl font-medium tracking-[-0.04em] sm:text-6xl">
            Every magical move has an exact start, end, prompt, and failure
            mode.
          </h2>
          <p className="mt-6 text-base leading-7 text-white/60">
            The scroll experience above uses the accepted generated video. These
            cards preserve the intended boundary frames, prompts, and known
            failure modes as the review contract.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {NORTH_TOPSAIL_CONNECTORS.map((connector) => (
            <SeamCard key={connector.id} connector={connector} />
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.035]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.2fr_.8fr] lg:py-28">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-cyan-200 uppercase">
              Experiment result
            </p>
            <h2 className="mt-4 text-4xl font-medium tracking-[-0.04em]">
              The hard seam is possible. The full property tour is still
              unbuilt.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/60">
              This probe spent $2.89 to test the riskiest route. Seedance kept
              the rooftop doorway coherent; Kling handled the aerial, stairs,
              and living-room moves economically. The result is evidence for a
              generation workflow, not evidence of the literal floor plan.
            </p>
          </div>
          <ol className="space-y-4 text-sm text-white/70">
            {[
              "Choose routes for spatial continuity before choosing hero shots.",
              "Generate missing architecture as reviewable still keyframes first.",
              "Use model bakeoffs only on the seams that actually carry risk.",
              "Backport the contract only after a second property proves it generalizes.",
            ].map((item, index) => (
              <li
                key={item}
                className="flex gap-4 rounded-2xl border border-white/10 p-4"
              >
                <span className="font-mono text-cyan-200">0{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
