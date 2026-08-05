import { exportDatoDraftForRun } from "../../src/server/services/blog-workbench/run";

// Derives the DatoCMS draft artifact for a persisted golden run (latest by
// default). Deterministic over run.json; safe to re-run.
//
//   bun --conditions=react-server scripts/lab/export-blog-dato-draft.ts [run-id]

const result = await exportDatoDraftForRun(process.argv[2]);

console.log(`run: ${result.runId}`);
console.log(`slug: ${result.export.attributes.url}`);
console.log(
  `dast valid: ${result.export.dastValidation.valid}${result.export.dastValidation.message ? ` (${result.export.dastValidation.message})` : ""}`,
);
console.log(
  `unresolved at push time: ${result.export.unresolved.map((item) => item.field).join(", ")}`,
);
console.log(result.path);
