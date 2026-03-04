import { env } from "@/env";

const PIPELINES_BATCH_URL = "https://cdp.customer.io/v1/batch";
const DEFAULT_USERS_PER_BATCH = 100;
const DEFAULT_CONCURRENCY = 20;

interface PipelinesIdentifyCall {
  type: "identify";
  userId: string;
  traits: Record<string, string | number | null>;
}

interface PipelinesBatchOptions {
  dryRun?: boolean;
  limit?: number;
  usersPerBatch?: number;
  concurrency?: number;
}

async function sendBatch(
  calls: PipelinesIdentifyCall[],
  apiKey: string,
): Promise<boolean> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  const res = await fetch(PIPELINES_BATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "X-Strict-Mode": "1",
    },
    body: JSON.stringify({ batch: calls }),
  });

  if (!res.ok) {
    console.error(`  Batch failed ${res.status}: ${await res.text()}`);
  }

  return res.ok;
}

async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export async function syncRecsViaPipelinesApi(
  allRecs: Map<string, Record<string, string | number | null>>,
  options: PipelinesBatchOptions = {},
): Promise<{ synced: number; failed: number }> {
  const apiKey = env.CUSTOMER_IO_PIPELINES_KEY;
  if (!apiKey) throw new Error("CUSTOMER_IO_PIPELINES_KEY is not configured");

  const usersPerBatch = options.usersPerBatch ?? DEFAULT_USERS_PER_BATCH;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (usersPerBatch <= 0) {
    throw new Error("usersPerBatch must be greater than 0");
  }
  if (concurrency <= 0) {
    throw new Error("concurrency must be greater than 0");
  }
  const entries = [...allRecs.entries()].slice(0, options.limit ?? Infinity);

  if (options.dryRun) {
    const batchCount = Math.ceil(entries.length / usersPerBatch);
    console.log(
      `  DRY RUN — would send ${batchCount} batch requests (${entries.length.toLocaleString()} users, ${usersPerBatch}/batch)`,
    );
    return { synced: 0, failed: 0 };
  }

  const batches: PipelinesIdentifyCall[][] = [];
  for (let i = 0; i < entries.length; i += usersPerBatch) {
    batches.push(
      entries.slice(i, i + usersPerBatch).map(([uid, attrs]) => ({
        type: "identify",
        userId: uid,
        traits: attrs,
      })),
    );
  }

  console.log(
    `  Sending ${batches.length} batch requests (${entries.length.toLocaleString()} users, ${usersPerBatch}/batch, ${concurrency} concurrent)...`,
  );

  const start = Date.now();
  const results = await runConcurrent(
    batches,
    (batch) => sendBatch(batch, apiKey),
    concurrency,
  );

  let synced = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const batchSize = batches[i]?.length ?? 0;
    if (results[i]) synced += batchSize;
    else failed += batchSize;
  }

  const elapsedMs = Date.now() - start;

  console.log(
    `  Synced ${synced.toLocaleString()} users in ${(elapsedMs / 1000).toFixed(1)}s (${elapsedMs > 0 ? ((synced / elapsedMs) * 1000).toFixed(0) : "0"}/sec)`,
  );

  return { synced, failed };
}
