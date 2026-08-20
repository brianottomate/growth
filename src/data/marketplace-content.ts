import type { MarketplaceListing } from "@/lib/marketplace-content";

const checkedAt = "2026-07-21";
const chatgptCheckedAt = "2026-08-19";
const repo = (label: string, evidenceCheckedAt = checkedAt) => [
  { source: "repository" as const, label, checkedAt: evidenceCheckedAt },
];

export const wanderMarketplaceListings: MarketplaceListing[] = [
  {
    id: "wander-ios",
    product: "Wander",
    surfaceId: "app_store",
    audience: "Guests finding, booking, and managing Wander stays on iPhone",
    strategy:
      "Show the quality of the homes, the direct booking path, and the support guests receive after booking.",
    availability: "public",
    fields: [
      {
        fieldId: "name",
        truth: "verified_live",
        content: "Wander",
        evidence: [
          {
            source: "public",
            label: "Apple App Store listing",
            checkedAt,
            url: "https://apps.apple.com/us/app/wa-nder/id1582777762",
          },
        ],
      },
      {
        fieldId: "icon",
        truth: "verified_live",
        content: "Black globe-mark icon",
        evidence: [
          {
            source: "public",
            label: "Apple App Store listing",
            checkedAt,
            url: "https://apps.apple.com/us/app/wa-nder/id1582777762",
          },
        ],
      },
      {
        fieldId: "subtitle",
        truth: "verified_live",
        content: "Vacation homes, but better",
        evidence: [
          {
            source: "public",
            label: "Apple App Store listing",
            checkedAt,
            url: "https://apps.apple.com/us/app/wa-nder/id1582777762",
          },
        ],
      },
      {
        fieldId: "screenshots",
        truth: "verified_live",
        content:
          "The public iPhone listing has a live screenshot set for search, property discovery, booking, and trip support.",
        next: "Import the current masters into Media Library before changing the sequence.",
        evidence: [
          {
            source: "public",
            label: "Apple App Store listing",
            checkedAt,
            url: "https://apps.apple.com/us/app/wa-nder/id1582777762",
          },
        ],
      },
      {
        fieldId: "previews",
        truth: "verify",
        next: "Check App Store Connect before assuming a preview is published.",
      },
      {
        fieldId: "promo",
        truth: "verify",
        next: "Check the current promotional text in App Store Connect.",
      },
      {
        fieldId: "description",
        truth: "verified_live",
        content:
          "The public listing describes curated vacation homes, direct booking, trip management, and 24/7 concierge service.",
        evidence: [
          {
            source: "public",
            label: "Apple App Store listing",
            checkedAt,
            url: "https://apps.apple.com/us/app/wa-nder/id1582777762",
          },
        ],
      },
      {
        fieldId: "keywords",
        truth: "verify",
        next: "Read the current keyword field in App Store Connect and compare it with guest search language.",
      },
      {
        fieldId: "support",
        truth: "verify",
        content: "https://www.wander.com/contact",
        next: "Check the maintained Support URL in App Store Connect. The public web page exposes the developer website and privacy policy, but not a separate support link.",
      },
      {
        fieldId: "privacy",
        truth: "verified_live",
        content: "https://www.wander.com/privacy",
        next: "Reconcile the App Privacy answers with the current mobile runtime before the next release.",
        evidence: [
          {
            source: "public",
            label: "Apple App Store privacy link",
            checkedAt,
            url: "https://apps.apple.com/us/app/wa-nder/id1582777762",
          },
        ],
      },
    ],
  },
  {
    id: "wander-chatgpt",
    product: "Wander",
    surfaceId: "chatgpt_plugin",
    audience:
      "Travelers planning a trip in ChatGPT or Codex who want real Wander inventory",
    strategy:
      "Let travelers search real stays, inspect the best options, and continue to Wander with the trip context intact.",
    availability: "testing",
    fields: [
      {
        fieldId: "name",
        truth: "source_verified",
        content: "Wander",
        evidence: repo("wander-mcp/src/index.ts", chatgptCheckedAt),
      },
      {
        fieldId: "icon",
        truth: "source_verified",
        content: "Wander brand mark used by the interactive MCP resource",
        next: "Export and validate the exact plugin listing asset set.",
        evidence: repo("wander-mcp/src/brand.ts", chatgptCheckedAt),
      },
      {
        fieldId: "promise",
        truth: "draft",
        content: "Find a Wander stay",
        next: "Use the validated submission subtitle in the review portal.",
      },
      {
        fieldId: "capabilities",
        truth: "source_verified",
        content:
          "Search public inventory by destination, dates, guests, price, bedrooms, and amenities. Inspect property facts and availability. Open a Wander booking page with the trip context preserved.",
        evidence: repo("wander-mcp/src/index.ts", chatgptCheckedAt),
      },
      {
        fieldId: "proof",
        truth: "verified_live",
        content:
          "The branded endpoint completed an MCP handshake and returned live Lake Tahoe inventory during the 19 August 2026 submission smoke.",
        next: "Capture the same flow in ChatGPT web and mobile after the revised tool metadata deploys.",
        evidence: [
          {
            source: "public",
            label: "Live branded Wander MCP smoke",
            checkedAt: chatgptCheckedAt,
            url: "https://www.wander.com/mcp",
          },
        ],
      },
      {
        fieldId: "setup",
        truth: "draft",
        content:
          "Connect https://www.wander.com/mcp, then search public Wander inventory and continue to Wander to book.",
        next: "Deploy the revised tool metadata, run Scan Tools, and complete the five positive and three negative submission tests.",
      },
      {
        fieldId: "privacy",
        truth: "verify",
        content: "https://www.wander.com/privacy",
        next: "Confirm that the policy describes assistant requests, retention, and the external booking handoff.",
      },
      {
        fieldId: "terms",
        truth: "source_verified",
        content:
          "Terms: https://www.wander.com/terms\nSupport: https://www.wander.com/help",
        evidence: [
          {
            source: "public",
            label: "Wander terms and support pages",
            checkedAt: chatgptCheckedAt,
            url: "https://www.wander.com/terms",
          },
        ],
      },
    ],
  },
  {
    id: "wander-claude",
    product: "Wander",
    surfaceId: "claude_connector",
    audience:
      "Travelers planning a trip with Claude who want current Wander inventory",
    strategy:
      "Give Claude a small public catalog surface with a clean handoff to direct booking.",
    availability: "public",
    fields: [
      {
        fieldId: "name",
        truth: "source_verified",
        content: "Wander",
        evidence: repo("wander-mcp/src/server.ts"),
      },
      {
        fieldId: "icon",
        truth: "source_verified",
        content: "Wander brand mark used by the interactive MCP resource",
        next: "Export and validate the exact connector-directory asset.",
        evidence: repo("wander-mcp/public/wander-mark.svg"),
      },
      {
        fieldId: "promise",
        truth: "draft",
        content:
          "Search Wander stays while you plan, then book directly on Wander.",
        next: "Test the wording with a complete Claude planning flow.",
      },
      {
        fieldId: "capabilities",
        truth: "source_verified",
        content:
          "Search public Wander inventory and inspect property details. Booking and payment stay on Wander.",
        evidence: repo("wander-mcp/src/tools"),
      },
      {
        fieldId: "proof",
        truth: "verified_live",
        content:
          "The current Worker initialized from Claude and returned live Lake Tahoe inventory on 21 July 2026.",
        evidence: [
          {
            source: "operator",
            label: "Live Claude-origin MCP check",
            checkedAt,
          },
        ],
      },
      {
        fieldId: "endpoint",
        truth: "draft",
        content: "https://www.wander.com/mcp",
        next: "Reverify the branded route immediately before directory review.",
        evidence: [
          {
            source: "public",
            label: "Worker implementation endpoint",
            checkedAt,
            url: "https://wander-mcp.wndr.workers.dev/mcp",
          },
        ],
      },
      {
        fieldId: "setup",
        truth: "draft",
        content:
          "Add https://www.wander.com/mcp as a custom connector, then ask Claude to find a Wander by destination, dates, and guest count.",
        next: "Verify plan and admin requirements in a clean account.",
      },
      {
        fieldId: "privacy",
        truth: "verify",
        content: "https://www.wander.com/privacy",
        next: "Confirm that the policy describes assistant requests, retention, and the external booking handoff.",
      },
      {
        fieldId: "review",
        truth: "missing",
        next: "Run the current Anthropic directory policy checklist and record each piece of evidence.",
      },
    ],
  },
];
