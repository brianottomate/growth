import { createFalClient } from "@fal-ai/client";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const RUN_ROOT = path.join(
  ROOT,
  "runs/property-showcase/wander-north-topsail-beach/generation",
);
const VIDEO_ROOT = path.join(RUN_ROOT, "videos");
const RECEIPT_PATH = path.join(RUN_ROOT, "receipts.json");
const KEYFRAME_ROOT = path.join(ROOT, "public/lab/property-showcase/keyframes");
const MAX_SPEND_USD = 5;

type Model = "kling-o3-standard" | "seedance-2-fast";

type Job = {
  id: string;
  model: Model;
  start: string;
  end: string;
  durationSeconds: number;
  estimatedCostUsd: number;
  prompt: string;
};

type Receipt = {
  jobId: string;
  model: Model;
  endpoint: string;
  requestId: string;
  submittedAt: string;
  completedAt?: string;
  estimatedCostUsd: number;
  outputUrl?: string;
  localVideoPath?: string;
  status: "submitted" | "completed" | "failed";
  error?: string;
};

type ReceiptFile = {
  schemaVersion: 1;
  capUsd: number;
  receipts: Receipt[];
};

const jobs: Job[] = [
  {
    id: "01-roof-approach-kling",
    model: "kling-o3-standard",
    start: "roof-overhead.png",
    end: "roof-terrace.png",
    durationSeconds: 5,
    estimatedCostUsd: 0.42,
    prompt:
      "One unbroken stabilized FPV drone shot. Descend smoothly and move forward onto the rooftop terrace, preserving the exact house, furniture, railings, neighboring homes, sunset, and red doors. No cuts, no object movement, no morphing. Finish on the exact terrace frame.",
  },
  {
    id: "02-enter-stairs-kling",
    model: "kling-o3-standard",
    start: "roof-terrace.png",
    end: "top-of-stairs.png",
    durationSeconds: 5,
    estimatedCostUsd: 0.42,
    prompt:
      "One continuous first-person architectural camera move. Glide across the real rooftop terrace toward the left red door. The door opens inward and the camera passes naturally through it into the exact stairwell shown in the final frame. Preserve terrace furniture and architecture. No cut, dissolve, teleport, morph, people, or moving furniture.",
  },
  {
    id: "02-enter-stairs-seedance",
    model: "seedance-2-fast",
    start: "roof-terrace.png",
    end: "top-of-stairs.png",
    durationSeconds: 5,
    estimatedCostUsd: 1.21,
    prompt:
      "Single unbroken first-person real-estate walkthrough. The stabilized camera glides across the rooftop terrace to the left red door, the door opens inward, and the camera passes through into the same coastal stairwell in the final frame. Preserve all architecture and furniture. No edit, dissolve, teleport, morph, people, or moving objects.",
  },
  {
    id: "03-descend-stairs-kling",
    model: "kling-o3-standard",
    start: "top-of-stairs.png",
    end: "lower-landing.png",
    durationSeconds: 5,
    estimatedCostUsd: 0.42,
    prompt:
      "One continuous stabilized first-person camera descends the staircase at a calm walking pace, follows the real turn in the stairs, and reaches the lower landing with the living room ahead. Preserve every step, handrail, metal baluster, wall, plant, window, and furnishing. No cut, dissolve, morph, duplicated stairs, people, or impossible geometry.",
  },
  {
    id: "04-enter-living-kling",
    model: "kling-o3-standard",
    start: "lower-landing.png",
    end: "living-room.png",
    durationSeconds: 5,
    estimatedCostUsd: 0.42,
    prompt:
      "One continuous stabilized first-person camera descends the final steps, moves straight through the opening, and settles gently inside the exact living room. Preserve the sectional, black coffee table, rug, television, console, windows, artwork, curtains, and daylight. No cut, dissolve, morph, people, moving furniture, or invented openings.",
  },
];

function requestedJobIds() {
  const index = process.argv.indexOf("--jobs");
  if (index === -1)
    throw new Error("Pass --jobs with comma-separated job IDs.");
  return new Set((process.argv[index + 1] ?? "").split(",").filter(Boolean));
}

async function exists(filePath: string) {
  return stat(filePath)
    .then(() => true)
    .catch(() => false);
}

await mkdir(VIDEO_ROOT, { recursive: true });
const ledger = await readFile(RECEIPT_PATH, "utf8")
  .then((value) => JSON.parse(value) as ReceiptFile)
  .catch(
    (): ReceiptFile => ({
      schemaVersion: 1,
      capUsd: MAX_SPEND_USD,
      receipts: [],
    }),
  );
const selected = requestedJobIds();
const selectedJobs = jobs.filter((job) => selected.has(job.id));
if (selectedJobs.length !== selected.size) {
  throw new Error("At least one requested job ID is unknown.");
}

const credentials = process.env.FAL_AI_API_KEY;
if (!credentials) throw new Error("FAL_AI_API_KEY is not configured.");
const fal = createFalClient({ credentials });
const uploads = new Map<string, string>();

async function saveLedger() {
  await writeFile(RECEIPT_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

function submittedSpend() {
  return ledger.receipts.reduce(
    (total, receipt) => total + receipt.estimatedCostUsd,
    0,
  );
}

async function uploadKeyframe(filename: string) {
  const cached = uploads.get(filename);
  if (cached) return cached;
  const filePath = path.join(KEYFRAME_ROOT, filename);
  const bytes = await readFile(filePath);
  const url = await fal.storage.upload(
    new File([bytes], filename, { type: "image/png" }),
  );
  uploads.set(filename, url);
  return url;
}

function endpointFor(model: Model) {
  return model === "kling-o3-standard"
    ? "fal-ai/kling-video/o3/standard/image-to-video"
    : "bytedance/seedance-2.0/fast/image-to-video";
}

function inputFor(job: Job, startUrl: string, endUrl: string) {
  if (job.model === "kling-o3-standard") {
    return {
      image_url: startUrl,
      end_image_url: endUrl,
      prompt: job.prompt,
      duration: String(job.durationSeconds),
      generate_audio: false,
    };
  }
  return {
    image_url: startUrl,
    end_image_url: endUrl,
    prompt: job.prompt,
    duration: String(job.durationSeconds),
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: false,
    bitrate_mode: "standard",
  };
}

for (const job of selectedJobs) {
  const prior = ledger.receipts.find((receipt) => receipt.jobId === job.id);
  if (prior?.status === "completed" && prior.localVideoPath) {
    const localPath = path.join(ROOT, prior.localVideoPath);
    if (await exists(localPath)) {
      console.log(`Skipping completed ${job.id}`);
      continue;
    }
  }
  if (prior) {
    throw new Error(
      `${job.id} already has a ${prior.status} receipt; reconcile it before retrying.`,
    );
  }
  if (submittedSpend() + job.estimatedCostUsd > MAX_SPEND_USD) {
    throw new Error(`$${MAX_SPEND_USD} spend cap would be exceeded.`);
  }

  const endpoint = endpointFor(job.model);
  const [startUrl, endUrl] = await Promise.all([
    uploadKeyframe(job.start),
    uploadKeyframe(job.end),
  ]);
  const submitted = await fal.queue.submit(endpoint, {
    input: inputFor(job, startUrl, endUrl),
    storageSettings: { expiresIn: "1d" },
  });
  const receipt: Receipt = {
    jobId: job.id,
    model: job.model,
    endpoint,
    requestId: submitted.request_id,
    submittedAt: new Date().toISOString(),
    estimatedCostUsd: job.estimatedCostUsd,
    status: "submitted",
  };
  ledger.receipts.push(receipt);
  await saveLedger();
  console.log(
    `Submitted ${job.id}; estimated cumulative spend $${submittedSpend().toFixed(2)}`,
  );

  try {
    let status = await fal.queue.status(endpoint, {
      requestId: receipt.requestId,
      logs: true,
    });
    while (status.status !== "COMPLETED") {
      console.log(`${job.id}: ${status.status}`);
      await Bun.sleep(5_000);
      status = await fal.queue.status(endpoint, {
        requestId: receipt.requestId,
        logs: true,
      });
    }
    const result = await fal.queue.result(endpoint, {
      requestId: receipt.requestId,
    });
    const data = result.data as { video?: { url?: string } };
    const outputUrl = data.video?.url;
    if (!outputUrl)
      throw new Error("Provider result did not contain a video URL.");
    const videoResponse = await fetch(outputUrl);
    if (!videoResponse.ok) {
      throw new Error(`Video download failed (${videoResponse.status}).`);
    }
    const localPath = path.join(VIDEO_ROOT, `${job.id}.mp4`);
    await writeFile(localPath, Buffer.from(await videoResponse.arrayBuffer()));
    receipt.status = "completed";
    receipt.completedAt = new Date().toISOString();
    receipt.outputUrl = outputUrl;
    receipt.localVideoPath = path.relative(ROOT, localPath);
    await saveLedger();
    console.log(`Completed ${job.id}: ${localPath}`);
  } catch (error) {
    receipt.status = "failed";
    receipt.error = error instanceof Error ? error.message : String(error);
    await saveLedger();
    throw error;
  }
}

console.log(`Estimated submitted spend: $${submittedSpend().toFixed(2)}`);
console.log(`Receipts: ${RECEIPT_PATH}`);
