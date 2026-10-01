import { COPY_VOICE_RULES } from "@/server/services/blog-workbench/prompt";
import { copyLabFixtures } from "@/server/services/copy-lab.service";

import { CopyWorkbench } from "./copy-workbench";

// The copy lab: frozen brands and homes through the production copy calls,
// with variants side by side. Fixtures come from
// scripts/lab/snapshot-copy-fixtures.ts.

export default function CopyLabPage() {
  const { snapshotAt, brands, homes } = copyLabFixtures;
  return (
    <CopyWorkbench
      snapshotAt={snapshotAt}
      brands={brands}
      homes={homes.map((home) => ({ ...home, photoCount: home.photos.length }))}
      presets={[{ id: "voice", label: "AI-isms ban", text: COPY_VOICE_RULES }]}
    />
  );
}
