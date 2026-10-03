import { executeBlogGoldenRun } from "../../src/server/services/blog-workbench/run";
import { syncBlogDraft } from "../../src/server/services/blog-workbench/draft-mirror";

// Executes one complete blog golden run and persists it as an immutable
// fixture under fixtures/blog/runs/.
//
//   bun --conditions=react-server scripts/lab/run-blog-golden.ts

const record = await executeBlogGoldenRun();

console.log(`run: ${record.runId}`);
console.log(
  `article: ${record.stages.article.sections.length} sections, ${record.totals.wordCount} words`,
);
for (const receipt of record.receipts.deterministic) {
  console.log(`check ${receipt.id}: ${receipt.status} (${receipt.summary})`);
}
console.log(
  `evaluator: ${record.receipts.evaluator.verdict} (${record.receipts.evaluator.comments.length} comments)`,
);
console.log(
  `est cost: $${record.totals.estCostUsd?.toFixed(2) ?? "unknown"} · ${Math.round(record.totals.latencyMs / 1000)}s of model time`,
);
const mirror = await syncBlogDraft(record);
console.log(`Velite draft: ${mirror.mdxPath}\nPreview: ${mirror.previewPath}`);
