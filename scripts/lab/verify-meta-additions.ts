/** Read-only provider checks and local CRUD on an isolated production-derived DB. */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, platformDeliveryGroupTable } from "@/server/db/schema";
import {
  addDeliveryGroup,
  setDeliveryGroup,
  deleteDeliveryGroup,
} from "@/server/services/ads-draft.service";
import {
  previewMetaAdditions,
  publishMetaAdditions,
} from "@/server/services/ads-reconcile.service";
if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Use a disposable Neon experiment branch");
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const originalFetch = globalThis.fetch;
let providerReads = 0,
  providerWrites = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    url.hostname.endsWith("zernio.com") ||
    url.hostname === "graph.facebook.com"
  ) {
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method !== "GET") {
      providerWrites++;
      throw new Error("Provider writes are forbidden in this validation");
    }
    providerReads++;
  }
  return originalFetch(input, init);
}) as typeof fetch;
const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "porchlit-properties"),
});
assert(brand?.organizationId, "Porchlit fixture is missing");
const scope = { organizationId: brand.organizationId };
const pending = await db.query.platformDeliveryGroupTable.findFirst({
  where: eq(platformDeliveryGroupTable.id, "pdg_68EXwXXccJe6FT9j"),
});
assert(pending, "Pending lookalike fixture is missing");
const denied = await previewMetaAdditions({
  deliveryGroupId: pending.id,
  organizationId: "org_no_access",
}).catch((error) => error as Error);
assert(denied instanceof Error, "Cross-organization read was accepted");
assert(providerReads === 0, "Unauthorized read reached a provider");
const review = await previewMetaAdditions({
  deliveryGroupId: pending.id,
  ...scope,
});
assert(
  review.ads.length === 11 && review.createsAdSet,
  "Expected the original 11 ads for a new ad set",
);
assert(
  review.blockers.some((b) => b.includes("Link required")),
  "Unlinked lookalike was not blocked",
);
const blocked = await publishMetaAdditions(
  { deliveryGroupId: pending.id, reviewToken: review.reviewToken },
  { ...scope, runId: "validation-no-provider-writes" },
).catch((error) => error as Error);
assert(
  blocked instanceof Error && blocked.message.includes("Link required"),
  "Blocked lookalike reached publishing",
);
const group = await addDeliveryGroup({
  ...scope,
  platformCampaignId: pending.platformCampaignId,
  name: "Validation only · unpublished",
  configuration: {
    platform: "meta_ads",
    targeting: { geography: { countries: ["US"] } },
  },
});
try {
  await setDeliveryGroup({
    ...scope,
    deliveryGroupId: group.id,
    name: "Validation edited",
    configuration: {
      platform: "meta_ads",
      targeting: { geography: { countries: ["US"], states: ["TN"] } },
    },
  });
  const live = await db.query.platformDeliveryGroupTable.findFirst({
    where: eq(
      platformDeliveryGroupTable.id,
      "pdg_de49c764deacb14440a51c9f5a93f1df",
    ),
  });
  assert(live?.externalId, "Live control fixture is missing");
  const refused = await setDeliveryGroup({
    ...scope,
    deliveryGroupId: live.id,
    name: "Must not save",
    configuration: { platform: "meta_ads" },
  }).catch((error) => error as Error);
  assert(
    refused instanceof Error,
    "Published targeting was editable as a local draft",
  );
} finally {
  await deleteDeliveryGroup({ ...scope, deliveryGroupId: group.id });
}
const control = await db.query.platformDeliveryGroupTable.findFirst({
  where: eq(
    platformDeliveryGroupTable.id,
    "pdg_de49c764deacb14440a51c9f5a93f1df",
  ),
});
assert(control, "Control fixture missing");
try {
  await db
    .update(platformDeliveryGroupTable)
    .set({ configuration: null })
    .where(eq(platformDeliveryGroupTable.id, control.id));
  const nativeReview = await previewMetaAdditions({
    deliveryGroupId: control.id,
    ...scope,
  });
  assert(
    !nativeReview.createsAdSet && nativeReview.ads.length === 0,
    "A native Meta set requires no synthetic draft configuration",
  );
} finally {
  await db
    .update(platformDeliveryGroupTable)
    .set({ configuration: control.configuration })
    .where(eq(platformDeliveryGroupTable.id, control.id));
}
assert(providerWrites === 0, "Unexpected provider write");
console.log(
  JSON.stringify({
    crossOrganizationDenied: true,
    unauthorizedProviderReads: 0,
    missingLookalikeBlocked: true,
    liveTargetingLocked: true,
    localPendingGroupCrud: true,
    providerWrites,
    reviewedAds: review.ads.length,
  }),
);
