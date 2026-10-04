import type { BrandIdentity } from "@/server/db/brand-schema";
import { compositionSpecSchema } from "@/lib/compositions";
import { extractedCardsSchema } from "./schemas";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import {
  loadCompositionSource,
  renderComposition,
  resolveCompositionContext,
} from "@/server/services/composition.service";

const [heading = "Gentium Book Plus", body = "Inter", ...only] =
  process.argv.slice(2);
const out = join(homedir(), "Downloads", "Chalets", "Square proof");
await import("node:fs/promises").then((f) => f.mkdir(out, { recursive: true }));
const cards = extractedCardsSchema.parse(
  JSON.parse(
    await readFile(
      join(homedir(), "Downloads", "Copy eval", "chalets-hh", "extracted.json"),
      "utf8",
    ),
  ),
);
const brand = (await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "chalets-hh"),
  columns: { id: true },
}))!;
const user = (await db.query.userTable.findFirst({
  where: eq(userTable.email, "kristian@wander.com"),
  columns: { id: true },
}))!;
for (const c of cards) {
  if (only.length && !only.some((o) => c.home.startsWith(o))) continue;
  if (!c.photoUrl) {
    console.log("no photo", c.home);
    continue;
  }
  const at = c.headline.lastIndexOf(" in ");
  const spec = compositionSpecSchema.parse({
    brandId: brand.id,
    templateId: "catalog-place-plain",
    formatId: "square",
    eyebrow: c.headline.slice(0, at + 3),
    title: c.headline.slice(at + 4),
    subtitle: c.facts ?? undefined,
    imagePosition: c.imagePosition ?? "center",
    mark: "none",
  });
  const ctx = await resolveCompositionContext(user.id, spec, {
    sourceUrl: c.photoUrl,
  });
  const identity: BrandIdentity = {
    ...(ctx.brand.brandIdentity ?? {}),
    fonts: [
      { family: heading, role: "heading", weight: 400 },
      { family: body, role: "body" },
    ],
    fontsChosen: { by: user.id, at: new Date().toISOString() },
  };
  ctx.brand.brandIdentity = identity;
  const img = renderComposition(spec, await loadCompositionSource(ctx));
  await writeFile(
    join(
      out,
      `${c.home.replace(/ - Hocking Hills$/, "").replace(/[^\w]+/g, "-")}.png`,
    ),
    Buffer.from(await img.arrayBuffer()),
  );
  console.log("ok", c.home, at);
}
process.exit(0);
