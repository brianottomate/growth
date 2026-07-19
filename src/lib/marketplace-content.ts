export const marketplaceSurfaceIds = [
  "app_store",
  "chrome_store",
  "chatgpt_plugin",
  "claude_connector",
] as const;

export type MarketplaceSurfaceId = (typeof marketplaceSurfaceIds)[number];
export type MarketplaceTruth =
  | "verified_live"
  | "source_verified"
  | "draft"
  | "verify"
  | "missing"
  | "deferred";
export type MarketplaceFieldKind =
  | "identity"
  | "copy"
  | "visual"
  | "discovery"
  | "trust"
  | "setup";

export type MarketplaceEvidence = {
  source: "public" | "operator" | "repository";
  label: string;
  checkedAt: string;
  url?: string;
};

export type MarketplaceFieldDefinition = {
  id: string;
  label: string;
  kind: MarketplaceFieldKind;
  need: "required" | "recommended" | "optional" | "directional";
  format?: string;
  purpose: string;
};

export type MarketplaceSurface = {
  id: MarketplaceSurfaceId;
  name: string;
  confidence: "exact" | "directional";
  context: string;
  officialUrl: string;
  fields: MarketplaceFieldDefinition[];
};

export type MarketplaceField = {
  fieldId: string;
  truth: MarketplaceTruth;
  content?: string;
  next?: string;
  evidence?: MarketplaceEvidence[];
};

export type MarketplaceListing = {
  id: string;
  product: string;
  surfaceId: MarketplaceSurfaceId;
  audience: string;
  strategy: string;
  availability: "public" | "testing" | "private" | "unverified";
  fields: MarketplaceField[];
};

const field = (
  id: string,
  label: string,
  kind: MarketplaceFieldKind,
  need: MarketplaceFieldDefinition["need"],
  purpose: string,
  format?: string,
): MarketplaceFieldDefinition => ({ id, label, kind, need, purpose, format });

export const marketplaceSurfaces: MarketplaceSurface[] = [
  {
    id: "app_store",
    name: "Apple App Store",
    confidence: "exact",
    context:
      "Search and product-page placements. A TestFlight build is testing evidence, not proof of a public product page.",
    officialUrl:
      "https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-app-information/",
    fields: [
      field(
        "name",
        "App name",
        "identity",
        "required",
        "Search and product-page identity.",
        "2–30 characters",
      ),
      field(
        "subtitle",
        "Subtitle",
        "copy",
        "recommended",
        "Compact durable benefit beneath the name.",
        "Up to 30 characters",
      ),
      field(
        "icon",
        "App icon",
        "identity",
        "required",
        "Recognition in search, store, and device contexts.",
      ),
      field(
        "screenshots",
        "Screenshot story",
        "visual",
        "required",
        "Outcome-first visual proof; early frames can appear in search.",
        "1–10 per supported device set",
      ),
      field(
        "previews",
        "App previews",
        "visual",
        "optional",
        "Motion proof when movement explains the product better.",
        "Up to 3 per device size and language",
      ),
      field(
        "promo",
        "Promotional text",
        "copy",
        "optional",
        "Timely message above the durable description.",
        "Up to 170 characters",
      ),
      field(
        "description",
        "Description",
        "copy",
        "required",
        "Long-form value, capability, and confidence copy.",
        "Up to 4,000 characters",
      ),
      field(
        "keywords",
        "Keywords",
        "discovery",
        "required",
        "Search language that complements name and subtitle.",
        "Up to 100 bytes",
      ),
      field(
        "support",
        "Support URL",
        "trust",
        "required",
        "Maintained route to product help.",
      ),
      field(
        "privacy",
        "Privacy policy",
        "trust",
        "required",
        "Public data-handling explanation matched to runtime behavior.",
      ),
    ],
  },
  {
    id: "chrome_store",
    name: "Chrome Web Store",
    confidence: "exact",
    context:
      "Search, category, and detail-page placements whose metadata must stay accurate to the current extension.",
    officialUrl:
      "https://developer.chrome.com/docs/webstore/cws-dashboard-listing",
    fields: [
      field(
        "name",
        "Extension name",
        "identity",
        "required",
        "Discovery and installed-product identity.",
      ),
      field(
        "icon",
        "Store icon",
        "identity",
        "required",
        "Small-format recognition.",
        "128×128 px",
      ),
      field(
        "description",
        "Detailed description",
        "copy",
        "required",
        "Concise job statement followed by accurate capabilities.",
      ),
      field(
        "screenshots",
        "Screenshot story",
        "visual",
        "required",
        "Current product UI and its core workflows.",
        "1–5 at 1280×800 or 640×400 px",
      ),
      field(
        "small-promo",
        "Small promo tile",
        "visual",
        "required",
        "Brand-led discovery creative, not a shrunken screenshot.",
        "440×280 px",
      ),
      field(
        "marquee",
        "Marquee image",
        "visual",
        "optional",
        "Feature-carousel creative.",
        "1400×560 px",
      ),
      field(
        "video",
        "Promotional video",
        "visual",
        "optional",
        "YouTube-hosted workflow demonstration.",
      ),
      field(
        "official-url",
        "Official URL",
        "trust",
        "recommended",
        "Verified publisher/site ownership signal.",
      ),
      field(
        "support",
        "Support URL",
        "trust",
        "recommended",
        "Maintained product help route.",
      ),
      field(
        "privacy",
        "Privacy practices",
        "trust",
        "required",
        "Permissions and data declarations reconciled with behavior.",
      ),
    ],
  },
  {
    id: "chatgpt_plugin",
    name: "ChatGPT plugin listing",
    confidence: "directional",
    context:
      "Since July 2026, discovery centers on plugin listings that can bundle apps, skills, and app templates.",
    officialUrl:
      "https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex",
    fields: [
      field(
        "name",
        "Plugin name",
        "identity",
        "directional",
        "Durable discovery identity across ChatGPT and Codex.",
      ),
      field(
        "icon",
        "Plugin icon",
        "identity",
        "directional",
        "Recognition in discovery, setup, and enabled contexts.",
      ),
      field(
        "promise",
        "Core promise",
        "copy",
        "directional",
        "The conversational outcome, not the protocol.",
      ),
      field(
        "capabilities",
        "Capabilities",
        "copy",
        "directional",
        "Included apps, skills, templates, data access, and actions.",
      ),
      field(
        "proof",
        "Conversation proof",
        "visual",
        "directional",
        "A real prompt-to-outcome sequence.",
      ),
      field(
        "setup",
        "Connection and setup",
        "setup",
        "directional",
        "Accounts, permissions, admin gates, and first prompt.",
      ),
      field(
        "privacy",
        "Privacy policy",
        "trust",
        "required",
        "Data access and action behavior matched to policy.",
      ),
      field(
        "terms",
        "Terms and support",
        "trust",
        "directional",
        "Commercial ownership and accountable help paths.",
      ),
    ],
  },
  {
    id: "claude_connector",
    name: "Claude connector",
    confidence: "directional",
    context:
      "Remote MCP connectors can be configured directly; the public directory is a separate curated review.",
    officialUrl:
      "https://support.anthropic.com/en/articles/11596036-anthropic-connectors-directory-faq",
    fields: [
      field(
        "name",
        "Connector name",
        "identity",
        "directional",
        "Trusted identity in setup and directory discovery.",
      ),
      field(
        "icon",
        "Connector icon",
        "identity",
        "directional",
        "Stable small-format product mark.",
      ),
      field(
        "promise",
        "Connector promise",
        "copy",
        "directional",
        "The context and outcomes Claude gains.",
      ),
      field(
        "capabilities",
        "Capabilities",
        "copy",
        "directional",
        "Task-grouped access and actions.",
      ),
      field(
        "proof",
        "Workflow proof",
        "visual",
        "directional",
        "A credible request, tool use, and result.",
      ),
      field(
        "endpoint",
        "Remote MCP endpoint",
        "setup",
        "required",
        "The verified HTTPS connection endpoint.",
      ),
      field(
        "setup",
        "Setup guidance",
        "setup",
        "recommended",
        "Plan/admin constraints, authentication, and first prompt.",
      ),
      field(
        "privacy",
        "Privacy policy",
        "trust",
        "required",
        "Collection, use, retention, and deletion disclosure.",
      ),
      field(
        "review",
        "Directory policy review",
        "trust",
        "required",
        "Safety, security, compatibility, and disclosure checklist.",
      ),
    ],
  },
];

export function auditMarketplace(listings: MarketplaceListing[]) {
  const fields = listings.flatMap((listing) =>
    listing.fields.filter((item) => item.truth !== "deferred"),
  );
  const count = (truth: MarketplaceTruth) =>
    fields.filter((item) => item.truth === truth).length;
  return {
    listings: listings.length,
    evidenced: fields.filter((item) => (item.evidence?.length ?? 0) > 0).length,
    verified: count("verified_live") + count("source_verified"),
    open: count("draft") + count("verify") + count("missing"),
    missing: count("missing"),
  };
}

const truthRank: Record<MarketplaceTruth, number> = {
  missing: 0,
  verify: 1,
  draft: 2,
  source_verified: 3,
  verified_live: 4,
  deferred: 5,
};

export function marketplaceQueue(listings: MarketplaceListing[]) {
  return listings
    .flatMap((listing) => {
      const surface = marketplaceSurfaces.find(
        (item) => item.id === listing.surfaceId,
      );
      return listing.fields.map((item) => ({
        listing,
        item,
        definition: surface?.fields.find(
          (candidate) => candidate.id === item.fieldId,
        ),
      }));
    })
    .filter(({ item, definition }) =>
      Boolean(
        definition && ["missing", "verify", "draft"].includes(item.truth),
      ),
    )
    .sort((a, b) => truthRank[a.item.truth] - truthRank[b.item.truth]);
}
