/**
 * Phase 1: Generate property embeddings using Voyage AI.
 *
 * Uses voyage-3-lite model (1024 dimensions, $0.06/1M tokens).
 * Total cost: ~$0.01 for ~730 properties.
 *
 * Ported from Python: clients/wander/recs/generate_embeddings.py
 */
import "server-only";
import type { BQProperty, PropertyEmbedding } from "./types";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 128;

// ── Text Builder ───────────────────────────────────────────────

function buildEmbeddingText(prop: BQProperty): string {
  const pets = prop.is_pet_allowed ? "pet-friendly" : "no pets";
  const description = (prop.description || "").slice(0, 500);

  let testimonials: string[] = [];
  try {
    testimonials = prop.testimonial_text ? JSON.parse(prop.testimonial_text) : [];
  } catch {
    // ignore parse errors
  }
  const topTestimonial = testimonials[0]?.slice(0, 200) ?? "";

  let activities: string[] = [];
  try {
    activities = prop.activities ? JSON.parse(prop.activities) : [];
  } catch {
    // ignore parse errors
  }
  const activityNames = activities.slice(0, 10).map((a) => {
    if (a.includes(" - ") && a.includes(":")) {
      return a.split(" - ")[1]?.split(":")[0]?.trim() ?? a;
    }
    return a;
  });

  let text = `${prop.property_name}
${prop.city}, ${prop.state}
${prop.landscape_category} landscape
${prop.bedrooms ?? "?"} bedrooms, ${prop.bathrooms ?? "?"} bathrooms, sleeps ${prop.occupancy ?? "?"}
$${prop.base_price ?? "?"}/night, ${pets}
${description}`;

  if (topTestimonial) {
    text += `\nGuest review: ${topTestimonial}`;
  }
  if (activityNames.length > 0) {
    text += `\nNearby: ${activityNames.join(", ")}`;
  }

  return text;
}

// ── Embedding Generation ───────────────────────────────────────

interface VoyageResponse {
  data: Array<{ embedding: number[] }>;
  usage: { total_tokens: number };
}

async function fetchVoyageEmbeddings(
  texts: string[],
  apiKey: string,
): Promise<{ embeddings: number[][]; tokens: number }> {
  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

    console.log(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} properties)...`,
    );

    let success = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: batch,
          model: "voyage-3-lite",
          input_type: "document",
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as VoyageResponse;
        for (const item of data.data) {
          allEmbeddings.push(item.embedding);
        }
        totalTokens += data.usage.total_tokens;
        console.log(`    ✓ (${data.usage.total_tokens} tokens)`);
        success = true;
        break;
      } else if (response.status === 429) {
        const wait = 25 * (attempt + 1);
        console.log(`    429 rate limited, waiting ${wait}s...`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      } else {
        const text = await response.text();
        console.error(`    Error ${response.status}: ${text}`);
        break;
      }
    }

    if (!success) {
      throw new Error(`Failed to generate embeddings for batch ${batchNum}`);
    }

    // Rate limit: wait between batches
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 22000));
    }
  }

  return { embeddings: allEmbeddings, tokens: totalTokens };
}

// ── Public API ─────────────────────────────────────────────────

export async function generatePropertyEmbeddings(
  properties: BQProperty[],
  voyageApiKey: string,
): Promise<Record<string, PropertyEmbedding>> {
  console.log(`\nGenerating embeddings for ${properties.length} properties...`);

  const texts = properties.map(buildEmbeddingText);
  const { embeddings, tokens } = await fetchVoyageEmbeddings(
    texts,
    voyageApiKey,
  );

  console.log(`  Total tokens: ${tokens.toLocaleString()}`);
  console.log(`  Estimated cost: $${((tokens * 0.06) / 1_000_000).toFixed(4)}`);

  const result: Record<string, PropertyEmbedding> = {};
  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i]!;
    result[prop.property_name] = {
      embedding: embeddings[i]!,
      city: prop.city,
      state: prop.state,
      landscape: prop.landscape_category,
      base_price: prop.base_price,
      bedrooms: prop.bedrooms,
      occupancy: prop.occupancy,
      url: prop.url,
      cover_image_url: prop.cover_image_url,
    };
  }

  console.log(`  Generated ${Object.keys(result).length} embeddings`);
  return result;
}
