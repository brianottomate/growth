import { desc, eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import { pregenNativeBuildTable } from "../../src/server/db/schema";
import { runPregenEvaluations } from "../../src/server/services/pregen/evaluation";

// Appends immutable evaluation receipts for a persisted build. With no
// argument it evaluates the newest succeeded build.
//
//   bun --conditions=react-server scripts/lab/run-pregen-evaluations.ts [build-id]

let buildId = process.argv[2];

if (!buildId) {
  const latest = await db.query.pregenNativeBuildTable.findFirst({
    where: eq(pregenNativeBuildTable.status, "succeeded"),
    orderBy: [desc(pregenNativeBuildTable.createdAt)],
    columns: { id: true },
  });
  if (!latest) throw new Error("No succeeded pregen build exists");
  buildId = latest.id;
}

const { receipts } = await runPregenEvaluations(buildId);

for (const receipt of receipts) {
  console.log(
    `${receipt.kind}: ${receipt.status} (${receipt.evaluatorName}/${receipt.evaluatorVersion}${receipt.model ? `, ${receipt.model}` : ""})`,
  );
}
