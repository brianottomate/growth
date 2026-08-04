import { notFound, redirect } from "next/navigation";

import { PregenLiveWorkbench } from "./pregen-live-workbench";
import { loadPregenLiveRun } from "./pregen-review-data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PregenReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const requestedBuildId =
    typeof params.build === "string" ? params.build : undefined;
  const run = await loadPregenLiveRun(requestedBuildId);

  if (!run) notFound();

  if (!requestedBuildId) {
    redirect(`/lab/pregen-review?build=${encodeURIComponent(run.build.id)}`);
  }

  return <PregenLiveWorkbench run={run} />;
}
