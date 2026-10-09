/** Applies an explicit reviewed input file; never computes stage/status from operational records. */
import { readFile, writeFile } from "node:fs/promises";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  brandTable,
  organizationTable,
  memberTable,
  userTable,
} from "@/server/db/schema";
import {
  performanceSettingsPatchSchema,
  setPerformanceSettings,
} from "@/server/services/performance-settings.service";

const inputPath = process.argv[process.argv.indexOf("--input") + 1];
if (!process.argv.includes("--input") || !inputPath)
  throw new Error(
    "Pass --input with a reviewed JSON file; default is dry-run.",
  );
const apply = process.argv.includes("--apply");
const input = z
  .strictObject({
    organization: z.literal("wander"),
    source: z.string().min(1),
    updates: z
      .array(
        z.strictObject({
          slug: z.string().min(1),
          expectedName: z.string().min(1),
          patch: performanceSettingsPatchSchema,
        }),
      )
      .min(1),
  })
  .parse(JSON.parse(await readFile(inputPath, "utf8")));
const org = await db.query.organizationTable.findFirst({
  where: eq(organizationTable.slug, input.organization),
  columns: { id: true },
});
if (!org) throw new Error("Organization not found");
const operator = await db.query.userTable.findFirst({
  where: eq(userTable.email, "kristian@wander.com"),
  columns: { id: true },
});
if (
  !operator ||
  !(await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.organizationId, org.id),
      eq(memberTable.userId, operator.id),
    ),
    columns: { id: true },
  }))
)
  throw new Error("Requesting operator must be a member of this organization");
const reviewed = [];
for (const update of input.updates) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, update.slug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, performanceSettings: true },
  });
  if (!brand || brand.name !== update.expectedName)
    throw new Error(`Brand identity changed: ${update.slug}`);
  reviewed.push({ ...update, brand });
}
if (new Set(reviewed.map((row) => row.brand.id)).size !== reviewed.length)
  throw new Error("Duplicate brand updates");
if (apply)
  await writeFile(
    `/tmp/wander-performance-card-backup-${Date.now()}.json`,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        source: input.source,
        organizationId: org.id,
        brands: reviewed.map((row) => row.brand),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
for (const row of reviewed) {
  if (!apply) {
    console.log(JSON.stringify({ name: row.brand.name, patch: row.patch }));
    continue;
  }
  const result = await setPerformanceSettings({
    brandId: row.brand.id,
    orgId: org.id,
    by: operator.id,
    from: "agent",
    patch: row.patch,
  });
  const saved = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, row.brand.id),
      eq(brandTable.organizationId, org.id),
    ),
    columns: { performanceSettings: true },
  });
  for (const [key, value] of Object.entries(row.patch)) {
    if (key === "cardState" && value) {
      for (const [field, expected] of Object.entries(value))
        if (
          JSON.stringify(
            saved?.performanceSettings?.cardState?.[
              field as keyof NonNullable<typeof row.patch.cardState>
            ],
          ) !== JSON.stringify(expected)
        )
          throw new Error(`Verification failed: ${row.slug} ${field}`);
    } else if (
      JSON.stringify(
        saved?.performanceSettings?.[
          key as keyof NonNullable<typeof saved.performanceSettings>
        ],
      ) !== JSON.stringify(value)
    )
      throw new Error(`Verification failed: ${row.slug} ${key}`);
  }
  console.log(
    JSON.stringify({
      name: row.brand.name,
      changed: result.changed,
      verified: true,
    }),
  );
}
