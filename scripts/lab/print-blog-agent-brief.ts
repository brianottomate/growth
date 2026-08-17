import {
  loadBlogVisualDirections,
  loadLatestBlogRun,
} from "../../src/server/services/blog-workbench/artifacts";
import { buildWorkbenchSnapshot } from "../../src/server/services/blog-workbench/workflow";

const run = await loadLatestBlogRun();
if (!run) {
  throw new Error("No saved blog run found. Execute lab:blog-run first.");
}

const visuals = await loadBlogVisualDirections();
const workbench = buildWorkbenchSnapshot(run, visuals);

console.log(workbench.agentBrief);
