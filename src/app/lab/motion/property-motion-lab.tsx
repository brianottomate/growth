"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const STILL_SOURCE = "/auth-hero.jpg";
const MOTION_SOURCE = "/lab/motion/mountain-house-control.mp4";

type ActivationMode = "intent" | "in-view" | "ambient";
type CardMode = "still" | "legacy-mask" | "full-frame";

interface LabControls {
  activation: ActivationMode;
  crossfadeMs: number;
  speed: number;
  reducedMotion: boolean;
}

interface PreviewCardProps {
  mode: CardMode;
  controls: LabControls;
  label: string;
  heading: string;
  copy: string;
}

const ORIGINAL_CASES = [
  {
    slug: "fairview-cabin",
    title: "Fairview cabin",
    variants: [1, 2],
    note: "Two completed standard-tier generations",
  },
  {
    slug: "north-topsail-beach",
    title: "North Topsail Beach",
    variants: [],
    note: "No completed standard-tier generation — batch stopped after the queue stalled",
  },
] as const;

function OriginalPipelineMaterial() {
  return (
    <section id="raw-material" className="mt-14 scroll-mt-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-blue-600 uppercase">
          Raw material
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          Seedance 2 Standard through the original Wander pipeline.
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The harness targets three independent generations per source. “Base”
          is the trimmed, upscaled, optionally masked composite; “Slow” is the
          original 3× interpolated treatment. Only completed provider outputs
          appear below.
        </p>
      </div>

      <div className="mt-8 space-y-12">
        {ORIGINAL_CASES.map((item) => (
          <article key={item.slug}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {item.note} · standard 720p generation · Topaz 1080p ·
                  optional SegFormer mask
                </p>
              </div>
              <a
                href={`/lab/motion/original-standard/${item.slug}/source.webp`}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Open source image ↗
              </a>
            </div>

            {item.variants.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-white/50 px-5 py-8 text-sm text-slate-500">
                Source preserved. No placeholder videos are presented as
                results.
              </div>
            ) : (
              <div className="mt-4 grid gap-5 xl:grid-cols-2">
                {item.variants.map((variant) => (
                  <div
                    key={variant}
                    className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm"
                  >
                    <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">
                      Variant {variant}
                    </div>
                    <div className="grid gap-px bg-black/10 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {(["base", "slow"] as const).map((speedMode) => {
                        const src = `/lab/motion/original-standard/${item.slug}/variant-${variant}/${speedMode}.mp4`;
                        return (
                          <figure key={speedMode} className="bg-slate-950">
                            <video
                              className="aspect-video w-full object-contain"
                              controls
                              loop
                              muted
                              playsInline
                              preload="metadata"
                              poster={`/lab/motion/original-standard/${item.slug}/source.webp`}
                            >
                              <source src={src} type="video/mp4" />
                            </video>
                            <figcaption className="flex items-center justify-between bg-white px-3 py-2 text-[11px] text-slate-500">
                              <span className="font-medium text-slate-900 capitalize">
                                {speedMode}
                              </span>
                              <a
                                href={src}
                                download
                                className="text-blue-600 hover:text-blue-800"
                              >
                                Download
                              </a>
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function PreviewCard({
  mode,
  controls,
  label,
  heading,
  copy,
}: PreviewCardProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [intentSeen, setIntentSeen] = useState(
    controls.activation === "ambient",
  );
  const [engaged, setEngaged] = useState(controls.activation === "ambient");
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const disabled =
    mode === "still" || controls.reducedMotion || systemReducedMotion || gaveUp;
  const active =
    engaged ||
    controls.activation === "ambient" ||
    (controls.activation === "in-view" && inView);
  const mountVideo =
    !disabled && (intentSeen || controls.activation === "ambient");
  const revealVideo = mountVideo && loaded && active;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (controls.activation !== "in-view") return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(entry?.isIntersecting);
        setInView(visible);
        if (visible) setIntentSeen(true);
      },
      { threshold: 0.72 },
    );
    observer.observe(surface);
    return () => observer.disconnect();
  }, [controls.activation]);

  useEffect(() => {
    if (controls.activation === "ambient") {
      setIntentSeen(true);
      setEngaged(true);
    } else {
      setEngaged(false);
    }
  }, [controls.activation]);

  useEffect(() => {
    if (!mountVideo || loaded) return;
    const timer = window.setTimeout(() => setGaveUp(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [loaded, mountVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = controls.speed;
    if (mountVideo && active) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [active, controls.speed, mountVideo]);

  const enter = () => {
    if (controls.activation !== "intent") return;
    setIntentSeen(true);
    setEngaged(true);
  };

  const leave = () => {
    if (controls.activation === "intent") setEngaged(false);
  };

  return (
    <article className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div
        ref={surfaceRef}
        className="relative aspect-[4/3] overflow-hidden bg-slate-950 outline-none"
        tabIndex={0}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={enter}
        onBlur={leave}
        aria-label={`${heading}. ${
          controls.activation === "intent"
            ? "Focus or hover to preview motion."
            : ""
        }`}
      >
        <Image
          src={STILL_SOURCE}
          alt="A modern cabin in a misty mountain landscape"
          fill
          priority
          className="object-cover object-[center_58%]"
          sizes="(min-width: 1024px) 33vw, 100vw"
        />
        {mountVideo && (
          <video
            ref={videoRef}
            aria-hidden="true"
            className={`absolute inset-0 size-full object-cover object-[center_58%] transition-opacity ease-out ${
              mode === "legacy-mask" ? "wander-motion-mask" : ""
            }`}
            style={{
              opacity: revealVideo ? 1 : 0,
              transitionDuration: `${controls.crossfadeMs}ms`,
            }}
            muted
            playsInline
            loop
            preload="none"
            poster={STILL_SOURCE}
            onLoadedData={() => setLoaded(true)}
          >
            <source src={MOTION_SOURCE} type="video/mp4" />
          </video>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-4 text-white">
          <span className="rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
            {label}
          </span>
          <span className="text-[11px] text-white/75">
            {disabled
              ? "Still"
              : controls.activation === "intent"
                ? "Hover to move"
                : controls.activation === "in-view"
                  ? inView
                    ? "In view"
                    : "Waiting"
                  : "Playing"}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-5 pt-24 pb-5 text-white">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-white/60 uppercase">
                Wander · Big Sky, Montana
              </p>
              <p className="mt-1 text-xl font-semibold">Mountain Glass House</p>
            </div>
            <p className="shrink-0 text-sm font-medium">$1,280 / night</p>
          </div>
        </div>
      </div>

      <div className="min-h-40 p-5">
        <h2 className="text-lg font-semibold text-slate-950">{heading}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
      </div>
    </article>
  );
}

const CONTROL_CLASS =
  "h-10 rounded-xl border border-black/10 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function PropertyMotionLab() {
  const [activation, setActivation] = useState<ActivationMode>("intent");
  const [crossfadeMs, setCrossfadeMs] = useState(700);
  const [speed, setSpeed] = useState(0.75);
  const [reducedMotion, setReducedMotion] = useState(false);
  const controls = { activation, crossfadeMs, speed, reducedMotion };

  return (
    <main className="min-h-screen bg-[#f4f1eb] text-slate-950">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-16">
        <Link
          href="/lab"
          className="text-sm text-slate-500 transition-colors hover:text-slate-950"
        >
          ← Lab
        </Link>

        <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-blue-600 uppercase">
              Property-card motion lab
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Re-test the old cinemagraph contract with today&apos;s cards.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
              This isolates the playback decision from the generation vendor.
              The same Wander-owned fixture powers every lane, so we can judge
              stillness, masking, loading, and hover feel without introducing a
              second marketplace media pipeline.
            </p>
          </div>

          <aside className="rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm backdrop-blur">
            <p className="text-sm font-semibold">Fixture receipt</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs text-slate-500">
              <dt>Source</dt>
              <dd className="text-right text-slate-900">Growth auth artwork</dd>
              <dt>Motion</dt>
              <dd className="text-right text-slate-900">
                Deterministic slow zoom
              </dd>
              <dt>Output</dt>
              <dd className="text-right text-slate-900">576 × 1024 · 6 s</dd>
              <dt>Purpose</dt>
              <dd className="text-right text-slate-900">
                Playback contract only
              </dd>
            </dl>
          </aside>
        </section>

        <section className="mt-10 rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-2 text-xs font-medium">
              Activation
              <select
                value={activation}
                onChange={(event) =>
                  setActivation(event.target.value as ActivationMode)
                }
                className={CONTROL_CLASS}
              >
                <option value="intent">Hover / focus</option>
                <option value="in-view">In view</option>
                <option value="ambient">Always on</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs font-medium">
              Crossfade
              <select
                value={crossfadeMs}
                onChange={(event) => setCrossfadeMs(Number(event.target.value))}
                className={CONTROL_CLASS}
              >
                <option value={0}>None</option>
                <option value={300}>300 ms</option>
                <option value={700}>700 ms · original</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs font-medium">
              Playback speed
              <select
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className={CONTROL_CLASS}
              >
                <option value={0.5}>0.5×</option>
                <option value={0.75}>0.75×</option>
                <option value={1}>1×</option>
              </select>
            </label>
            <label className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-black/10 bg-white px-3 text-xs font-medium">
              Simulate reduced motion
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.target.checked)}
                className="size-4 accent-blue-600"
              />
            </label>
          </div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-3">
          <PreviewCard
            mode="still"
            controls={controls}
            label="Control"
            heading="Still image"
            copy="The base card. Every animated treatment should feel like this exact composition woke up—not like the card was replaced."
          />
          <PreviewCard
            mode="legacy-mask"
            controls={controls}
            label="Original Wander"
            heading="Masked hover layer"
            copy="The still remains underneath. Only the approved atmospheric region reveals video, with the original 700 ms hover crossfade and a 20-second failure cutoff."
          />
          <PreviewCard
            mode="full-frame"
            controls={controls}
            label="Modern contract"
            heading="Full-frame motion"
            copy="The entire moving frame is trusted. It removes segmentation and compositing, but any model drift in the house or camera becomes visible immediately."
          />
        </section>

        <OriginalPipelineMaterial />

        <section className="mt-12 rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-blue-300 uppercase">
                What this lab decides
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Presentation first. Generation second.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                If the full-frame contract looks stable with a real provider
                output, Growth can orchestrate that asset without becoming a
                second producer for marketplace units.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Poster remains the source of truth",
                "Mount only after intent or in-view",
                "Muted, looped, inline playback",
                "Reduced-motion disables the layer",
                "Late loads fail quietly after 20 s",
                "Mobile swaps hover for visibility",
              ].map((rule) => (
                <div
                  key={rule}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
                >
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .wander-motion-mask {
          -webkit-mask-image: linear-gradient(
            to bottom,
            #000 0%,
            #000 46%,
            rgba(0, 0, 0, 0.85) 54%,
            transparent 66%
          );
          mask-image: linear-gradient(
            to bottom,
            #000 0%,
            #000 46%,
            rgba(0, 0, 0, 0.85) 54%,
            transparent 66%
          );
        }
      `}</style>
    </main>
  );
}
