import { desc, eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import {
  pregenNativeArtifactTable,
  pregenNativeBuildTable,
  pregenNativeProspectTable,
} from "../../src/server/db/schema";
import { runBuildToCompletion } from "../../src/server/services/pregen/pipeline";

// Runs one growth-native pregen build start to finish, in this process.
//
//   bun --conditions=react-server scripts/lab/run-pregen-native-build.ts <domain-or-url>
//
// The tRPC mutation is the same thing behind an auth check and an `after()`
// chain, which needs a request context. This is the lab entry point: same
// steps, same checkpoints, same rows, no server.

const input = process.argv[2];
if (!input) {
  throw new Error(
    "usage: run-pregen-native-build.ts <domain-or-url>  (e.g. cascadiagetaways.com)",
  );
}

const origin = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  .origin;
const domain = new URL(origin).hostname.replace(/^www\./, "");

const [prospect] = await db
  .insert(pregenNativeProspectTable)
  .values({ sourceUrl: origin, domain, status: "building" })
  .onConflictDoUpdate({
    target: pregenNativeProspectTable.domain,
    set: { sourceUrl: origin, status: "building" },
  })
  .returning({
    id: pregenNativeProspectTable.id,
    previewToken: pregenNativeProspectTable.previewToken,
  });
if (!prospect) throw new Error("failed to upsert pregen prospect");

const [build] = await db
  .insert(pregenNativeBuildTable)
  .values({ prospectId: prospect.id })
  .returning({ id: pregenNativeBuildTable.id });
if (!build) throw new Error("failed to create pregen build");

console.log(`prospect ${prospect.id}  build ${build.id}  ${origin}`);

const startedAt = Date.now();
await runBuildToCompletion(build.id);

const finished = await db.query.pregenNativeBuildTable.findFirst({
  where: eq(pregenNativeBuildTable.id, build.id),
  columns: { status: true, error: true, stepLog: true },
});

for (const entry of finished?.stepLog ?? []) {
  const seconds = entry.finishedAt
    ? Math.round(
        (Date.parse(entry.finishedAt) - Date.parse(entry.startedAt)) / 1000,
      )
    : null;
  const stats = entry.stats
    ? Object.entries(entry.stats)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")
    : "";
  console.log(
    `  ${entry.step.padEnd(18)} ${entry.error ? `FAILED ${entry.error}` : `ok ${seconds}s ${stats}`}`,
  );
}

const artifact = await db.query.pregenNativeArtifactTable.findFirst({
  where: eq(pregenNativeArtifactTable.buildId, build.id),
  orderBy: [desc(pregenNativeArtifactTable.version)],
  columns: { id: true, version: true },
});

console.log(
  `\n${finished?.status}  ${Math.round((Date.now() - startedAt) / 1000)}s` +
    (artifact ? `  artifact ${artifact.id} v${artifact.version}` : "") +
    `\ntoken ${prospect.previewToken}`,
);

process.exit(0);
