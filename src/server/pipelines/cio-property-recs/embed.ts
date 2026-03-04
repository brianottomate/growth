import { env } from "@/env";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PropertyEmbedding {
  embedding: number[];
  city: string;
  state: string;
  landscape: string;
  description: string;
  base_price: number | null;
  bedrooms: number | null;
  url: string;
  cover_image_url: string;
}

// Minimal input interface — BQProperty satisfies this structurally
interface EmbeddableProperty {
  property_name: string;
  city: string;
  state: string;
  landscape_category: string;
  bedrooms: number | null;
  bathrooms: number | null;
  occupancy: number | null;
  base_price: number | null;
  is_pet_allowed: boolean;
  description: string;
  testimonial_text: string | null;
  activities: string | null;
  cover_image_url: string;
  url: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const BATCH_SIZE = 256; // OpenAI supports up to 2048 inputs per request

// ── Text Builder ──────────────────────────────────────────────────────────────

function buildPropertyText(prop: EmbeddableProperty): string {
  const pets = prop.is_pet_allowed ? "pet-friendly" : "no pets";
  const description = (prop.description ?? "").slice(0, 500);

  let testimonials: string[] = [];
  try {
    testimonials = prop.testimonial_text ? (JSON.parse(prop.testimonial_text) as string[]) : [];
  } catch { /* ignore */ }

  let activities: string[] = [];
  try {
    activities = prop.activities ? (JSON.parse(prop.activities) as string[]) : [];
  } catch { /* ignore */ }

  const activityNames = activities.slice(0, 10).map((a) => {
    if (a.includes(" - ") && a.includes(":")) return a.split(" - ")[1]?.split(":")[0]?.trim() ?? a;
    return a;
  });

  let text = [
    prop.property_name,
    `${prop.city}, ${prop.state}`,
    `${prop.landscape_category} landscape`,
    `${prop.bedrooms ?? "?"} bedrooms, ${prop.bathrooms ?? "?"} bathrooms, sleeps ${prop.occupancy ?? "?"}`,
    `$${prop.base_price ?? "?"}/night, ${pets}`,
    description,
  ].join("\n");

  if (testimonials[0]) text += `\nGuest review: ${testimonials[0].slice(0, 200)}`;
  if (activityNames.length) text += `\nNearby: ${activityNames.join(", ")}`;

  return text;
}

// ── OpenAI Embeddings API ─────────────────────────────────────────────────────

interface OpenAIEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

async function callOpenAIEmbedApi(texts: string[], apiKey: string): Promise<number[][]> {
  const all: number[][] = [];
  let totalTokens = 0;
  const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`  Embedding batch ${batchNum}/${totalBatches} (${batch.length} properties)...`);

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(OPENAI_EMBED_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: batch, model: OPENAI_EMBED_MODEL, dimensions: EMBED_DIMS }),
      });

      if (res.ok) {
        const data = (await res.json()) as OpenAIEmbedResponse;
        // OpenAI guarantees order matches input, but sort by index to be safe
        const sorted = data.data.sort((a, b) => a.index - b.index);
        all.push(...sorted.map((d) => d.embedding));
        totalTokens += data.usage.total_tokens;
        break;
      } else if (res.status === 429) {
        const wait = 5 * (attempt + 1);
        console.log(`    Rate limited — waiting ${wait}s...`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      } else {
        throw new Error(`OpenAI embeddings error ${res.status}: ${await res.text()}`);
      }
    }
  }

  console.log(
    `  Total tokens: ${totalTokens.toLocaleString()} (~$${((totalTokens * 0.02) / 1_000_000).toFixed(4)})`,
  );
  return all;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generatePropertyEmbeddings(
  properties: EmbeddableProperty[],
): Promise<Record<string, PropertyEmbedding>> {
  const apiKey = env.OPENAI_API_KEY;

  console.log(`  Generating embeddings for ${properties.length} properties...`);
  const vectors = await callOpenAIEmbedApi(properties.map(buildPropertyText), apiKey);

  return Object.fromEntries(
    properties.map((prop, i) => [
      prop.property_name,
      {
        embedding: vectors[i]!,
        city: prop.city,
        state: prop.state,
        landscape: prop.landscape_category,
        description: (prop.description ?? "").slice(0, 500),
        base_price: prop.base_price,
        bedrooms: prop.bedrooms,
        url: prop.url,
        cover_image_url: prop.cover_image_url,
      },
    ]),
  );
}
