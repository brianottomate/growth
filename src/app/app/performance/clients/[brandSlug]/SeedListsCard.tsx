"use client";
import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { orpc } from "@/orpc/client";
import type { SeedDelivery } from "@/server/services/seeds/delivery";
import { NewSeedList, type NewSeedListContext } from "./NewSeedList";
import { ShapeBrandButton } from "./ShapeBrandButton";
import { useWorkspaceMutation } from "./useWorkspaceMutation";

const STAGE_LABEL = {
  not_built: "Not built",
  built: "Not on Meta",
  uploading: "Uploading to Meta",
  uploaded: "On Meta",
  lookalike: "Lookalike, not shared",
  shared: "Lookalike ready",
} as const;

/**
 * The brand's lists of people for paid seeds. Built here from a starting
 * point; each Meta ad set delivers them.
 */
export function SeedListsCard({
  brandName,
  seeds,
  context,
}: {
  brandName: string;
  seeds: SeedDelivery[];
  context: NewSeedListContext;
}) {
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <UsersRound className="size-4 text-muted-foreground" />
          Seed lists
        </h2>
        <div className="flex flex-wrap gap-2">
          {!!seeds.length && <NewSeedList context={context} />}
          <ShapeBrandButton
            brandId={context.brandId}
            brandName={brandName}
            section="seed lists"
          />
        </div>
      </div>
      {!seeds.length ? (
        <EmptyState
          compact
          icon={UsersRound}
          title="People to seed Meta with"
          description="Start from past bookers, an email list, these destinations or a persona."
          actions={<NewSeedList context={context} primary />}
        />
      ) : (
        <div className="space-y-2">
          {seeds.map((seed) => (
            <SeedRow key={seed.seedListId} seed={seed} />
          ))}
        </div>
      )}
    </section>
  );
}

function SeedRow({ seed }: { seed: SeedDelivery }) {
  const rebuild = useWorkspaceMutation(orpc.seed.rebuild.mutationOptions());
  const build = seed.snapshot;
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4 @xl:flex-row @xl:items-center @xl:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="font-medium">{seed.seedListName}</h3>
        <p className="text-sm text-muted-foreground">
          {seed.seedListName === seed.builtFrom ? "" : `${seed.builtFrom} · `}
          {build
            ? `${build.memberCount.toLocaleString("en-US")} people · built ${new Date(build.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "not built yet"}
        </p>
        {build?.warning && (
          <p className="text-xs text-muted-foreground">{build.warning}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge variant="secondary">{STAGE_LABEL[seed.stage]}</Badge>
        <Button
          size="sm"
          variant="outline"
          loading={rebuild.isPending}
          onClick={() => rebuild.mutate({ seedListId: seed.seedListId })}
        >
          Rebuild
        </Button>
      </div>
    </article>
  );
}
