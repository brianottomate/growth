/**
 * Write a client performance report from a JSON file, validated against the
 * report contract (`src/lib/performance-report.ts`). Prints the report id and
 * its public link. Pass `id` in the file to replace an existing report.
 *
 *   bun --conditions react-server scripts/performance-report-upsert.ts report.json
 *
 * See content/playbooks/client-performance-report.md for how the numbers are pulled.
 */
import { readFileSync } from "node:fs";

import {
  performanceReportWrite,
  upsertPerformanceReport,
} from "@/server/services/performance-report.service";

const file = process.argv[2];
if (!file) {
  console.error("Usage: performance-report-upsert.ts <report.json>");
  process.exit(1);
}

const row = await upsertPerformanceReport(
  performanceReportWrite.parse(JSON.parse(readFileSync(file, "utf8"))),
);
const origin = process.env.REPORT_ORIGIN ?? "https://growth-red.vercel.app";
console.log(JSON.stringify({ ...row, url: `${origin}/report/${row.token}` }));
process.exit(0);
