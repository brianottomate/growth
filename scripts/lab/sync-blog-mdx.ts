import { loadLatestBlogRun } from "../../src/server/services/blog-workbench/artifacts";
import { syncBlogDraft } from "../../src/server/services/blog-workbench/draft-mirror";

const record = await loadLatestBlogRun();
if (!record) throw new Error("No saved blog run. Create a run first.");
const mirror = await syncBlogDraft(record);
console.log(`Draft: ${mirror.mdxPath}\nPreview: ${mirror.previewPath}`);
