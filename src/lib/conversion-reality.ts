export type ConversionFindingKind =
  | "delete_label"
  | "duplicate_external_id"
  | "duplicate_name"
  | "missing_primary_mapping"
  | "not_implemented"
  | "unverified";

export type ConversionRealityFinding = {
  kind: ConversionFindingKind;
  severity: "high" | "medium" | "low";
  platform?: string;
  entityIds: string[];
  finding: string;
  recommendedAction: string;
};

type ConversionIntentRow = {
  id: string;
  name: string;
  isPrimary: boolean;
};

type ConversionMappingRow = {
  id: string;
  platform: string;
  platformEventName: string;
  externalConversionId: string | null;
  status: "wanted" | "not_implemented" | "verified";
  channelId: string | null;
  channel: { externalId: string | null } | null;
  sources: { conversionEventId: string }[];
};

function normalizedActionName(value: string): string {
  return value
    .replace(/^\s*\[delete\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function groupedDuplicates<T>(
  rows: readonly T[],
  keyFor: (row: T) => string | null,
): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/** Pure reconciliation so provider-safety rules stay deterministic and tested. */
export function findConversionRealityIssues(
  events: readonly ConversionIntentRow[],
  mappings: readonly ConversionMappingRow[],
): ConversionRealityFinding[] {
  const findings: ConversionRealityFinding[] = [];
  const mappedEventIds = new Set(
    mappings.flatMap((mapping) =>
      mapping.sources.map((source) => source.conversionEventId),
    ),
  );

  for (const event of events) {
    if (event.isPrimary && !mappedEventIds.has(event.id)) {
      findings.push({
        kind: "missing_primary_mapping",
        severity: "high",
        entityIds: [event.id],
        finding: `Primary conversion intent "${event.name}" has no provider mapping.`,
        recommendedAction:
          "Confirm the canonical event fires, then create or link the provider conversion action without replacing an active primary.",
      });
    }
  }

  for (const mapping of mappings) {
    if (/^\s*\[delete\]/i.test(mapping.platformEventName)) {
      findings.push({
        kind: "delete_label",
        severity: "medium",
        platform: mapping.platform,
        entityIds: [mapping.id],
        finding: `"${mapping.platformEventName}" is explicitly marked as a cleanup candidate.`,
        recommendedAction:
          "Verify recent activity, bidding dependencies, and ownership in the provider before archiving; never delete automatically.",
      });
    }
    if (mapping.status === "not_implemented") {
      findings.push({
        kind: "not_implemented",
        severity: "medium",
        platform: mapping.platform,
        entityIds: [mapping.id],
        finding: `"${mapping.platformEventName}" is confirmed absent from the current implementation.`,
        recommendedAction:
          "Either implement the mapping from the canonical event or explicitly remove the intent from the matrix.",
      });
    } else if (mapping.status !== "verified") {
      findings.push({
        kind: "unverified",
        severity: "low",
        platform: mapping.platform,
        entityIds: [mapping.id],
        finding: `"${mapping.platformEventName}" has not been verified against current provider reality.`,
        recommendedAction:
          "Read the provider action and recent diagnostics, then stamp the matrix only after the ID, account, and event source agree.",
      });
    }
  }

  for (const group of groupedDuplicates(mappings, (mapping) =>
    mapping.externalConversionId
      ? `${mapping.platform}:${mapping.externalConversionId}`
      : null,
  )) {
    findings.push({
      kind: "duplicate_external_id",
      severity: "high",
      platform: group[0]?.platform,
      entityIds: group.map((mapping) => mapping.id),
      finding: `${group.length} Growth mappings point at the same provider conversion ID.`,
      recommendedAction:
        "Reconcile the Growth rows before changing provider state; one provider action may intentionally aggregate several canonical events through mapping sources.",
    });
  }

  for (const group of groupedDuplicates(mappings, (mapping) => {
    const account = mapping.channel?.externalId ?? mapping.channelId;
    return account
      ? `${mapping.platform}:${account}:${normalizedActionName(mapping.platformEventName)}`
      : null;
  })) {
    const distinctProviderIds = new Set(
      group.map((mapping) => mapping.externalConversionId).filter(Boolean),
    );
    if (distinctProviderIds.size < 2) continue;
    findings.push({
      kind: "duplicate_name",
      severity: "medium",
      platform: group[0]?.platform,
      entityIds: group.map((mapping) => mapping.id),
      finding: `${group.length} similarly named conversion actions exist in one provider account.`,
      recommendedAction:
        "Compare activity, primary/secondary status, bidding use, and tag source. Preserve the active primary and archive only proven dead duplicates.",
    });
  }

  return findings;
}
