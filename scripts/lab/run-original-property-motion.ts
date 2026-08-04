import { createOpenAI } from "@ai-sdk/openai";
import { fal } from "@fal-ai/client";
import { generateText, Output } from "ai";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import Replicate, { type Prediction } from "replicate";
import sharp from "sharp";
import { z } from "zod";

const ROOT = path.resolve(import.meta.dir, "../..");
const OUTPUT_ROOT = path.join(ROOT, "public/lab/motion/original-standard");
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "/opt/homebrew/bin/ffprobe";
const FAL_SEEDANCE_MODEL = "bytedance/seedance-2.0/image-to-video";
const TOPAZ_MODEL = "topazlabs/video-upscale";
const SEGFORMER_VERSION =
  "a2e13e3527942cb26fd17f896cafd648875f80feeb842444f0cd253acc093cd0";
const MOTION_LABELS = new Set([
  "sky",
  "water",
  "sea",
  "lake",
  "river",
  "ocean",
  "swimming pool",
  "tree",
  "vegetation",
  "grass",
  "plant",
  "bush",
  "palm",
]);

const CASES = [
  {
    slug: "fairview-cabin",
    title: "Fairview cabin",
    source:
      "/Users/kristianeboe/Downloads/Home in Fairview, North Carolina .webp",
  },
  {
    slug: "north-topsail-beach",
    title: "Wander North Topsail Beach",
    source: "/Users/kristianeboe/Downloads/Wander North Topsail Beach  .webp",
  },
] as const;

const analysisSchema = z.object({
  prompt: z.string(),
  containsFire: z
    .boolean()
    .describe("True only when actual visible flames are present."),
});

const COMMON_PROMPT = `You are an expert AI Prompt Engineer. Analyze the attached property photograph and produce a cinemagraph prompt for Bytedance Seedance 1 Pro.

Universal principles:
1) Ground the prompt in the provided photograph as the absolute source of truth and forbid new elements.
2) Say that the camera is "absolutely locked-down and completely static, with zero movement."
3) Say lighting is "perfectly constant and unchanging," preserving the source moment.
4) Name a few rigid elements as "perfectly motionless, as if frozen in a single moment." Do not include water, fire, or clouds in that clause.

Analyze broad animatable categories in this priority order: sky, then water or visible fire, then vegetation only as a last resort. Motion must be minimal, subtle, photorealistic, and physically plausible. Detect whether actual visible flames are present; a fireplace or fire pit without flames is not fire.`;

const FALLBACK_PROMPT = `Generate a photorealistic real-time cinemagraph, using the provided photograph as the absolute source of truth for all visual elements, objects, and lighting. No new objects or light sources should be introduced.

The camera is absolutely locked-down and completely static, with zero movement. The overall ambient lighting and exposure across the entire scene must remain perfectly constant and unchanging.

All rigid elements must remain perfectly motionless, as if frozen in a single moment. Only existing clouds may drift very slowly and gently.`;

type Receipt = Pick<
  Prediction,
  | "id"
  | "status"
  | "model"
  | "version"
  | "metrics"
  | "created_at"
  | "started_at"
  | "completed_at"
  | "error"
>;

type FalReceipt = {
  provider: "fal";
  requestId: string;
  model: string;
  seed: number | null;
  output: {
    contentType?: string;
    fileName?: string;
    fileSize?: number;
  };
};

type VariantManifest = {
  variant: number;
  motion: "single" | "dual";
  requestedMask: boolean;
  appliedMask: boolean;
  seed: number;
  prompt: string;
  containsFire: boolean;
  files: Record<string, string>;
  receipts: Record<string, Receipt | FalReceipt>;
  segmentationLabels: string[];
  status: "running" | "succeeded" | "failed";
  error?: string;
};

type CaseManifest = {
  slug: string;
  title: string;
  source: string;
  sourceMetadata: Awaited<ReturnType<typeof imageMetadata>>;
  variants: VariantManifest[];
};

const replicateToken = process.env.REPLICATE_API_TOKEN;
const openAiKey = process.env.OPENAI_API_KEY;
const falKey = process.env.FAL_AI_API_KEY;
if (!replicateToken || !openAiKey || !falKey) {
  throw new Error(
    "REPLICATE_API_TOKEN, OPENAI_API_KEY, and FAL_AI_API_KEY are required (values are never logged).",
  );
}
const replicate = new Replicate({
  auth: replicateToken,
  useFileOutput: false,
});
const openai = createOpenAI({ apiKey: openAiKey });
fal.config({ credentials: falKey });

function relative(filePath: string) {
  return `/${path.relative(path.join(ROOT, "public"), filePath)}`;
}

async function dataUri(filePath: string, mediaType: string) {
  const buffer = await readFile(filePath);
  if (buffer.byteLength > 10_000_000) {
    throw new Error(
      `${path.basename(filePath)} is too large for the lab's inline provider boundary`,
    );
  }
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

function stableSeed(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2_147_483_647;
}

function variantShape(slug: string, variant: number) {
  if (variant === 1) return { motion: "dual" as const, mask: false };
  if (variant === 2) return { motion: "single" as const, mask: true };
  const seed = stableSeed(`${slug}:${variant}:shape`);
  return {
    motion: seed % 2 ? ("dual" as const) : ("single" as const),
    mask: seed % 3 !== 0,
  };
}

async function imageMetadata(filePath: string) {
  const [metadata, file] = await Promise.all([
    sharp(filePath).metadata(),
    stat(filePath),
  ]);
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: metadata.format ?? null,
    bytes: file.size,
  };
}

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${path.basename(command)} exited ${code}: ${stderr.slice(-4000)}`,
          ),
        );
    });
  });
}

async function probe(filePath: string) {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(FFPROBE, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      filePath,
    ]);
    child.stdout.on("data", (chunk: Uint8Array) =>
      chunks.push(Buffer.from(chunk)),
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffprobe exited ${code}`)),
    );
  });
  const data = JSON.parse(Buffer.concat(chunks).toString()) as {
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }>;
    format?: { duration?: string };
  };
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: video?.avg_frame_rate ?? "0/0",
    duration: Number(data.format?.duration ?? 0),
  };
}

function receipt(prediction: Prediction): Receipt {
  return {
    id: prediction.id,
    status: prediction.status,
    model: prediction.model,
    version: prediction.version,
    metrics: prediction.metrics,
    created_at: prediction.created_at,
    started_at: prediction.started_at,
    completed_at: prediction.completed_at,
    error: prediction.error,
  };
}

async function predict(
  label: string,
  request: Parameters<typeof replicate.predictions.create>[0],
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      console.log(`[${label}] submitting${attempt === 2 ? " retry" : ""}`);
      const created = await replicate.predictions.create(request);
      const finished = await replicate.wait(created, { interval: 2000 });
      if (finished.status !== "succeeded") {
        const providerError =
          typeof finished.error === "string"
            ? finished.error
            : (JSON.stringify(finished.error) ?? "unknown provider error");
        throw new Error(
          `${finished.status}: ${providerError}`,
        );
      }
      console.log(`[${label}] succeeded (${finished.id})`);
      return finished;
    } catch (error) {
      lastError = error;
      if (attempt === 1) console.warn(`[${label}] failed once; retrying`);
    }
  }
  throw lastError;
}

async function generateWithFal(input: {
  label: string;
  imageUrl: string;
  prompt: string;
  seed: number;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      console.log(
        `[${input.label}] submitting to Fal Seedance 2 Standard${attempt === 2 ? " retry" : ""}`,
      );
      let lastQueueStatus: string | undefined;
      const result = await fal.subscribe(FAL_SEEDANCE_MODEL, {
        input: {
          image_url: input.imageUrl,
          duration: 8,
          resolution: "720p",
          aspect_ratio: "auto",
          generate_audio: false,
          prompt: input.prompt,
          seed: input.seed,
        },
        logs: true,
        onEnqueue: (requestId) => {
          console.log(`[${input.label}] queued (${requestId})`);
        },
        onQueueUpdate: (update) => {
          if (update.status !== lastQueueStatus) {
            console.log(`[${input.label}] ${update.status}`);
            lastQueueStatus = update.status;
          }
        },
      });
      const data = result.data as {
        seed?: number;
        video?: {
          url?: string;
          content_type?: string;
          file_name?: string;
          file_size?: number;
        };
      };
      if (!data.video?.url) {
        throw new Error("Fal completed without a video URL");
      }
      console.log(`[${input.label}] succeeded (${result.requestId})`);
      return {
        url: data.video.url,
        receipt: {
          provider: "fal" as const,
          requestId: result.requestId,
          model: FAL_SEEDANCE_MODEL,
          seed: data.seed ?? input.seed,
          output: {
            contentType: data.video.content_type,
            fileName: data.video.file_name,
            fileSize: data.video.file_size,
          },
        } satisfies FalReceipt,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 1) console.warn(`[${input.label}] failed once; retrying`);
    }
  }
  throw lastError;
}

function outputUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length) return outputUrl(output[0]);
  if (output && typeof output === "object") {
    const candidate = output as {
      url?: (() => URL) | string;
      urls?: { get?: string };
    };
    if (typeof candidate.url === "function") return String(candidate.url());
    if (typeof candidate.url === "string") return candidate.url;
    if (candidate.urls?.get) return candidate.urls.get;
  }
  throw new Error(
    `Unsupported provider output: ${JSON.stringify(output).slice(0, 500)}`,
  );
}

async function download(url: string, destination: string) {
  if (url.startsWith("data:")) {
    const base64 = url.slice(url.indexOf(",") + 1);
    await writeFile(destination, Buffer.from(base64, "base64"));
    return;
  }
  if (!url.includes("://") && /^[A-Za-z0-9+/]+={0,2}$/.test(url)) {
    await writeFile(destination, Buffer.from(url, "base64"));
    return;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Download failed (${response.status}) from provider output`,
    );
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function usableVideo(filePath: string) {
  try {
    const file = await stat(filePath);
    if (file.size === 0) return false;
    const metadata = await probe(filePath);
    return metadata.width > 0 && metadata.height > 0 && metadata.duration > 0;
  } catch {
    return false;
  }
}

async function promptFor(source: string, motion: "single" | "dual") {
  const instruction = `${COMMON_PROMPT}\n\nExecution: animate ${
    motion === "dual"
      ? "the highest-priority category plus one distinct category if both are visibly present"
      : "only the single highest-priority category visibly present"
  }. Return only the requested structured result.`;
  try {
    const { output } = await generateText({
      model: openai("gpt-5"),
      output: Output.object({
        name: "CinemagraphPrompt",
        schema: analysisSchema,
      }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            {
              type: "file",
              mediaType: "image/webp",
              data: await readFile(source),
            },
          ],
        },
      ],
    });
    return output;
  } catch (error) {
    console.warn(
      `[prompt:${motion}] failed; using locked-camera fallback: ${String(error)}`,
    );
    return { prompt: FALLBACK_PROMPT, containsFire: false };
  }
}

async function normalizeVideo(
  input: string,
  output: string,
  crf = 20,
  fps?: number,
) {
  await run(FFMPEG, [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "medium",
    "-an",
    "-pix_fmt",
    "yuv420p",
    "-vsync",
    "cfr",
    ...(fps ? ["-r", String(fps)] : []),
    "-movflags",
    "+faststart",
    "-y",
    output,
  ]);
}

async function trim(input: string, output: string) {
  await run(FFMPEG, [
    "-i",
    input,
    "-ss",
    "2",
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-preset",
    "medium",
    "-an",
    "-pix_fmt",
    "yuv420p",
    "-vsync",
    "cfr",
    "-movflags",
    "+faststart",
    "-y",
    output,
  ]);
}

async function upscale(
  input: string,
  directory: string,
  receipts: Record<string, Receipt | FalReceipt>,
) {
  const metadata = await probe(input);
  if (metadata.height >= 1080) return input;
  const prediction = await predict("topaz", {
    model: TOPAZ_MODEL,
    input: {
      video: await dataUri(input, "video/mp4"),
      target_fps: 24,
      target_resolution: "1080p",
    },
  });
  receipts.topaz = receipt(prediction);
  const raw = path.join(directory, "upscaled-raw.mp4");
  const normalized = path.join(directory, "upscaled.mp4");
  await download(outputUrl(prediction.output), raw);
  await normalizeVideo(raw, normalized, 18, 24);
  return normalized;
}

type SegmentationItem = { mask: string; label?: string };

async function segmentation(
  video: string,
  directory: string,
  receipts: Record<string, Receipt | FalReceipt>,
) {
  const firstFrame = path.join(directory, "first-frame.jpg");
  await run(FFMPEG, [
    "-i",
    video,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    "-y",
    firstFrame,
  ]);
  const prediction = await predict("segformer", {
    version: SEGFORMER_VERSION,
    input: { image: await dataUri(firstFrame, "image/jpeg") },
  });
  receipts.segformer = receipt(prediction);
  const raw = prediction.output as SegmentationItem[];
  const selected = Array.isArray(raw)
    ? raw.filter((item) => MOTION_LABELS.has((item.label ?? "").toLowerCase()))
    : [];
  const files: Array<{ path: string; label: string }> = [];
  for (const [index, item] of selected.entries()) {
    const label = (item.label ?? `mask-${index}`).toLowerCase();
    const filePath = path.join(
      directory,
      `mask-${index}-${label.replace(/[^a-z0-9]+/g, "-")}.png`,
    );
    await download(item.mask, filePath);
    files.push({ path: filePath, label });
  }
  return files;
}

async function combineMasks(
  masks: Array<{ path: string; label: string }>,
  directory: string,
) {
  if (!masks.length) return null;
  const loaded = await Promise.all(
    masks.map(async (mask) => {
      const { data, info } = await sharp(mask.path)
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        data,
        width: info.width,
        height: info.height,
        channels: info.channels,
      };
    }),
  );
  const width = loaded[0]!.width;
  const height = loaded[0]!.height;
  const combinedAlpha = Buffer.alloc(width * height, 255);
  for (const mask of loaded) {
    const rgba = Buffer.alloc(mask.width * mask.height * 4);
    for (
      let src = 0, dst = 0;
      src < mask.data.length;
      src += mask.channels, dst += 4
    ) {
      const r = mask.data[src] ?? 0;
      const g = mask.channels >= 3 ? (mask.data[src + 1] ?? r) : r;
      const b = mask.channels >= 3 ? (mask.data[src + 2] ?? r) : r;
      const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      rgba[dst] = 255;
      rgba[dst + 1] = 255;
      rgba[dst + 2] = 255;
      rgba[dst + 3] = 255 - luma;
    }
    const resized =
      mask.width === width && mask.height === height
        ? rgba
        : await sharp(rgba, {
            raw: { width: mask.width, height: mask.height, channels: 4 },
          })
            .resize(width, height, { kernel: sharp.kernel.nearest })
            .raw()
            .toBuffer();
    for (let pixel = 0; pixel < combinedAlpha.length; pixel += 1) {
      combinedAlpha[pixel] = Math.min(
        combinedAlpha[pixel]!,
        resized[pixel * 4 + 3]!,
      );
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  const luma = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < combinedAlpha.length; pixel += 1) {
    const alpha = combinedAlpha[pixel]!;
    const color = alpha < 255 ? 255 : 0;
    rgba[pixel * 4] = color;
    rgba[pixel * 4 + 1] = color;
    rgba[pixel * 4 + 2] = color;
    rgba[pixel * 4 + 3] = alpha;
    luma[pixel * 3] = 255 - alpha;
    luma[pixel * 3 + 1] = 255 - alpha;
    luma[pixel * 3 + 2] = 255 - alpha;
  }
  const combinedPath = path.join(directory, "combined-mask.png");
  const featheredPath = path.join(directory, "mask-luma-feather-20.png");
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(combinedPath);
  await sharp(luma, { raw: { width, height, channels: 3 } })
    .blur(20)
    .png()
    .toFile(featheredPath);
  return { combinedPath, featheredPath };
}

async function applyMask(video: string, maskPath: string, output: string) {
  const metadata = await probe(video);
  const still = path.join(path.dirname(output), "still.png");
  await run(FFMPEG, [
    "-i",
    video,
    "-frames:v",
    "1",
    "-vf",
    "format=rgba",
    "-y",
    still,
  ]);
  await run(FFMPEG, [
    "-loop",
    "1",
    "-framerate",
    "24",
    "-i",
    still,
    "-i",
    video,
    "-i",
    maskPath,
    "-filter_complex",
    `[2:v]scale=${metadata.width}:${metadata.height},format=gray,setsar=1[mask];` +
      `[1:v]scale=${metadata.width}:${metadata.height},setsar=1[video];` +
      `[0:v]scale=${metadata.width}:${metadata.height},format=rgba,setsar=1[still];` +
      `[video][mask]alphamerge[video_alpha];` +
      `[still][video_alpha]overlay=0:0:shortest=1[composite];` +
      `[composite]pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1[out]`,
    "-map",
    "[out]",
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-preset",
    "medium",
    "-an",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "24",
    "-movflags",
    "+faststart",
    "-y",
    output,
  ]);
}

async function slow(input: string, output: string) {
  const metadata = await probe(input);
  const filter = `[0:v]format=yuv420p,minterpolate=mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:fps=90,setpts=3*PTS,trim=duration=${metadata.duration},setpts=PTS-STARTPTS,fps=30[v]`;
  await run(FFMPEG, [
    "-i",
    input,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-preset",
    "medium",
    "-an",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    output,
  ]);
}

async function writeManifest(manifest: CaseManifest) {
  await writeFile(
    path.join(OUTPUT_ROOT, manifest.slug, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function runCase(input: (typeof CASES)[number]) {
  await stat(input.source);
  const caseDirectory = path.join(OUTPUT_ROOT, input.slug);
  await mkdir(caseDirectory, { recursive: true });
  const sourceCopy = path.join(caseDirectory, "source.webp");
  await copyFile(input.source, sourceCopy);
  const seedInput = path.join(caseDirectory, "seed-input.jpg");
  await sharp(input.source)
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toFile(seedInput);
  const seedUrl = await fal.storage.upload(
    new Blob([await readFile(seedInput)], { type: "image/jpeg" }),
  );
  const manifestPath = path.join(caseDirectory, "manifest.json");
  const previousManifest = await readFile(manifestPath, "utf8")
    .then((contents) => JSON.parse(contents) as CaseManifest)
    .catch(() => null);
  const manifest: CaseManifest = {
    slug: input.slug,
    title: input.title,
    source: relative(sourceCopy),
    sourceMetadata: await imageMetadata(input.source),
    variants: [],
  };

  for (const variant of [1, 2, 3]) {
    const previous = previousManifest?.variants.find(
      (candidate) => candidate.variant === variant,
    );
    if (
      previous?.status === "succeeded" &&
      previous.files.base &&
      previous.files.slow &&
      (await usableVideo(path.join(ROOT, "public", previous.files.base))) &&
      (await usableVideo(path.join(ROOT, "public", previous.files.slow)))
    ) {
      console.log(`[${input.slug}:v${variant}] reusing completed outputs`);
      manifest.variants.push(previous);
      await writeManifest(manifest);
      continue;
    }
    const shape = variantShape(input.slug, variant);
    const directory = path.join(caseDirectory, `variant-${variant}`);
    await mkdir(directory, { recursive: true });
    const generatedPrompt = previous
      ? { prompt: previous.prompt, containsFire: previous.containsFire }
      : await promptFor(input.source, shape.motion);
    const entry: VariantManifest = {
      ...previous,
      variant,
      motion: shape.motion,
      requestedMask: shape.mask,
      appliedMask: false,
      seed: stableSeed(`${input.slug}:${variant}:seed`),
      prompt: generatedPrompt.prompt,
      containsFire: generatedPrompt.containsFire,
      files: previous?.files ?? {},
      receipts: previous?.receipts ?? {},
      segmentationLabels: previous?.segmentationLabels ?? [],
      status: "running",
    };
    delete entry.error;
    manifest.variants.push(entry);
    entry.files.seedInput = relative(seedInput);
    await writeManifest(manifest);

    try {
      const rawPath = path.join(directory, "raw.mp4");
      const trimmedPath = path.join(directory, "trimmed.mp4");
      if (!(await usableVideo(rawPath))) {
        const generated = await generateWithFal({
          label: `${input.slug}:v${variant}:seedance`,
          imageUrl: seedUrl,
          prompt: entry.prompt,
          seed: entry.seed,
        });
        entry.receipts.seedance = generated.receipt;
        await download(generated.url, rawPath);
        await writeManifest(manifest);
      } else {
        console.log(`[${input.slug}:v${variant}:seedance] reusing raw output`);
      }
      entry.files.raw = relative(rawPath);
      if (!(await usableVideo(trimmedPath))) await trim(rawPath, trimmedPath);
      entry.files.trimmed = relative(trimmedPath);
      await writeManifest(manifest);

      const upscaledPath = path.join(directory, "upscaled.mp4");
      let baseInput = (await usableVideo(upscaledPath))
        ? upscaledPath
        : await upscale(trimmedPath, directory, entry.receipts).catch(
            (error) => {
              console.warn(
                `[${input.slug}:v${variant}:topaz] continuing at 720p: ${String(error)}`,
              );
              return trimmedPath;
            },
          );
      entry.files.upscaled = relative(baseInput);
      await writeManifest(manifest);

      if (entry.requestedMask && !entry.containsFire) {
        const masks = await segmentation(
          baseInput,
          directory,
          entry.receipts,
        ).catch((error) => {
          console.warn(
            `[${input.slug}:v${variant}:mask] continuing unmasked: ${String(error)}`,
          );
          return [];
        });
        entry.segmentationLabels = masks.map((mask) => mask.label);
        await writeManifest(manifest);
        const combined = await combineMasks(masks, directory);
        if (combined) {
          const masked = path.join(directory, "base-masked.mp4");
          await applyMask(baseInput, combined.featheredPath, masked);
          baseInput = masked;
          entry.appliedMask = true;
          entry.files.combinedMask = relative(combined.combinedPath);
          entry.files.featheredMask = relative(combined.featheredPath);
        }
      }

      const base = path.join(directory, "base.mp4");
      if (baseInput !== base) await copyFile(baseInput, base);
      const slowPath = path.join(directory, "slow.mp4");
      await slow(base, slowPath);
      entry.files.base = relative(base);
      entry.files.slow = relative(slowPath);
      entry.status = "succeeded";
      await writeManifest(manifest);
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof Error ? error.message : String(error);
      console.error(`[${input.slug}:v${variant}] failed: ${entry.error}`);
    } finally {
      await writeManifest(manifest);
    }
  }
  return manifest;
}

await mkdir(OUTPUT_ROOT, { recursive: true });
const cases: CaseManifest[] = [];
for (const input of CASES) {
  console.log(`\n=== ${input.title} ===`);
  cases.push(await runCase(input));
}
await writeFile(
  path.join(OUTPUT_ROOT, "manifest.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      pipeline: "original-wander-hero-animation",
      generator: FAL_SEEDANCE_MODEL,
      rejectedChallenger: {
        provider: "replicate",
        model: "bytedance/seedance-2.0",
        reason:
          "Provider ReadError on authenticated-file and inline-JPEG inputs",
      },
      cases,
    },
    null,
    2,
  )}\n`,
);
const succeeded = cases
  .flatMap((item) => item.variants)
  .filter((item) => item.status === "succeeded").length;
console.log(
  `\nCompleted ${succeeded}/${CASES.length * 3} variants. Manifest: ${path.join(OUTPUT_ROOT, "manifest.json")}`,
);
