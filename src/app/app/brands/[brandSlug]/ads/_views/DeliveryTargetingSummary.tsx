import { GeographyChips } from "@/components/geography-chips";
import { normalizeAudienceGeography } from "@/lib/audience-targeting-geography";
import type { DeliveryGeography } from "@/server/db/ads-schema";

export function DeliveryTargetingSummary({
  audience,
}: {
  audience: {
    geography?: DeliveryGeography | null;
    ageMin?: number | null;
    ageMax?: number | null;
    metaTargetName?: string;
  };
}) {
  const geo = normalizeAudienceGeography(audience.geography ?? {});
  const hasGeo = [geo.countries, geo.states, geo.regions, geo.cities].some(
    (a) => a?.length,
  );
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p className="font-medium">Ad set targeting</p>
      <GeographyChips label="Countries" values={geo.countries} />
      <GeographyChips label="States" values={geo.states} />
      <GeographyChips label="Regions" values={geo.regions} />
      <GeographyChips label="City targets" values={geo.cities} />
      {!hasGeo && (
        <p>Location not set. Choose delivery geography before pushing.</p>
      )}
      <p>
        {audience.ageMin != null || audience.ageMax != null
          ? `Ages ${audience.ageMin ?? 13}–${audience.ageMax ?? "65+"}`
          : "No age narrowing"}
      </p>
      {audience.metaTargetName && (
        <p>Meta audience: {audience.metaTargetName}</p>
      )}
    </div>
  );
}
