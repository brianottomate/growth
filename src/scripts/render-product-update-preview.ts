import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { productUpdatePreviewProposalSchema } from "@/lib/email-document";
import { renderDesignSystemNewsletter } from "@/server/email/newsletter-renderer-core";

const proposalPath = process.argv.find((argument) =>
  argument.endsWith(".json"),
);
if (!proposalPath) {
  throw new Error(
    "Pass a product-update proposal JSON file, for example: bun run product-update:preview -- proposal.json",
  );
}

const proposal = productUpdatePreviewProposalSchema.parse(
  JSON.parse(await readFile(resolve(proposalPath), "utf8")),
);
const rendered = await renderDesignSystemNewsletter({
  document: proposal.draft,
  brandName: proposal.brandName,
  logo: proposal.logo,
});
const outputDir = resolve("runs/product-updates", proposal.key);
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "preview.html"), rendered.html),
  writeFile(resolve(outputDir, "preview.txt"), rendered.text),
  writeFile(
    resolve(outputDir, "proposal.json"),
    `${JSON.stringify(proposal, null, 2)}\n`,
  ),
]);

process.stdout.write(
  `${JSON.stringify(
    {
      key: proposal.key,
      releaseReady: proposal.draft.productUpdate.changes.every(
        (change) => change.releaseStatus === "shipped",
      ),
      evidenceCount: proposal.draft.productUpdate.changes.length,
      outputDir,
      previewHtml: resolve(outputDir, "preview.html"),
      previewText: resolve(outputDir, "preview.txt"),
    },
    null,
    2,
  )}\n`,
);
