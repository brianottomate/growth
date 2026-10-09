import { AudienceMap } from "@/components/audience-map";
import { GeographyChips } from "@/components/geography-chips";
import type { DeliveryGeography } from "@/server/db/ads-schema";

export function DeliveryCoverage({
  targets,
  compact = false,
  showMap = true,
}: {
  compact?: boolean;
  showMap?: boolean;
  targets: { id: string; name: string; geography?: DeliveryGeography | null }[];
}) {
  const states = [
    ...new Set(targets.flatMap((target) => target.geography?.states ?? [])),
  ];
  const countries = [
    ...new Set(targets.flatMap((target) => target.geography?.countries ?? [])),
  ];
  const configured = targets.some((t) =>
    Object.values(t.geography ?? {}).some((values) => values?.length),
  );
  return (
    <section
      className={compact ? "space-y-2" : "space-y-2 rounded-lg border p-3"}
    >
      <h4 className="text-sm font-medium">Location targeting</h4>
      <GeographyChips label="States" values={states} />
      <GeographyChips label="Countries" values={countries} />
      {!configured && (
        <p className="text-xs text-muted-foreground">
          Locations not configured.
        </p>
      )}
      {configured && showMap && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            View delivery coverage
          </summary>
          <div className="mt-3">
            <AudienceMap
              audiences={targets.map((t) => ({
                ...t,
                geography: t.geography ?? null,
              }))}
            />
          </div>
        </details>
      )}
    </section>
  );
}
