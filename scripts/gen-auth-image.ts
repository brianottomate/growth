/**
 * One-off: generate the auth-page hero image via Fal (same provider the studio
 * uses, fal-ai/flux/dev) and save it to public/auth-hero.jpg. Run once; the
 * output is committed as a static asset. Not wired into the app.
 *
 *   doppler run --project wander-growth --config dev -- bun run scripts/gen-auth-image.ts
 */
import { createFalClient } from "@fal-ai/client";

const key = process.env.FAL_AI_API_KEY;
if (!key) throw new Error("FAL_AI_API_KEY not set (run via `doppler run`)");

const client = createFalClient({ credentials: key });

const prompt =
  "Cinematic wide photograph of a modern minimalist cabin with floor-to-ceiling " +
  "windows perched on a quiet hillside overlooking a misty pine valley at golden " +
  "hour, warm interior glow, calm and aspirational travel mood, soft natural light, " +
  "muted earthy palette, subtle film grain, no people, no text, no logos, highly detailed.";

const result = await client.subscribe("fal-ai/flux/dev", {
  input: {
    prompt,
    image_size: "portrait_16_9",
    output_format: "jpeg",
    num_images: 1,
    enable_safety_checker: true,
  },
});

const data = result.data as { images?: Array<{ url: string }> };
const url = data.images?.[0]?.url;
if (!url) throw new Error(`No image in Fal response: ${JSON.stringify(result.data)}`);

const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
await Bun.write("public/auth-hero.jpg", bytes);
console.log(`saved public/auth-hero.jpg (${(bytes.length / 1024).toFixed(0)} KB) from ${url}`);
