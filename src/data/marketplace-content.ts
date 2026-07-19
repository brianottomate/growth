import type { MarketplaceListing } from "@/lib/marketplace-content";

const checkedAt = "2026-07-20";
const repo = (label: string) => [
  { source: "repository" as const, label, checkedAt },
];

export const wanderMarketplaceListings: MarketplaceListing[] = [
  {
    id: "wander-ios",
    product: "Wander mobile",
    surfaceId: "app_store",
    audience: "Guests discovering and managing Wander stays on iPhone",
    strategy:
      "Make the path from aspiration to a confidently managed stay visually obvious.",
    availability: "testing",
    fields: [
      {
        fieldId: "name",
        truth: "source_verified",
        content: "Wander Staging",
        next: "Visible in TestFlight build 1.15.0 (309); verify the public App Store name independently.",
        evidence: [
          {
            source: "operator",
            label: "Visible in TestFlight on iPhone",
            checkedAt,
          },
        ],
      },
      {
        fieldId: "icon",
        truth: "source_verified",
        content: "Black globe-mark icon",
        next: "TestFlight evidence only; confirm the public product-page asset.",
        evidence: [
          { source: "operator", label: "TestFlight icon capture", checkedAt },
        ],
      },
      {
        fieldId: "subtitle",
        truth: "missing",
        next: "Map guest search intent before drafting.",
      },
      {
        fieldId: "screenshots",
        truth: "missing",
        next: "Storyboard discover, inspect, book, arrive, and manage-stay outcomes from current production UI.",
      },
      {
        fieldId: "previews",
        truth: "deferred",
        next: "Defer until motion proves incremental value.",
      },
      {
        fieldId: "promo",
        truth: "missing",
        next: "Use only for a current, evidenced launch message.",
      },
      {
        fieldId: "description",
        truth: "missing",
        next: "Draft from verified mobile capabilities and current marketplace positioning.",
      },
      {
        fieldId: "keywords",
        truth: "missing",
        next: "Build a real ASO intent map from guest language.",
      },
      {
        fieldId: "support",
        truth: "verify",
        next: "Verify the exact maintained mobile support destination.",
      },
      {
        fieldId: "privacy",
        truth: "verify",
        next: "Reconcile the live policy with booking, identity, payment, location, and messaging flows.",
      },
    ],
  },
  {
    id: "growth-chatgpt",
    product: "Wander Growth",
    surfaceId: "chatgpt_plugin",
    audience:
      "Wander operators working with marketing context in ChatGPT or Codex",
    strategy:
      "Turn conversational intent into reviewable work inside the Wander Growth workspace.",
    availability: "private",
    fields: [
      {
        fieldId: "name",
        truth: "source_verified",
        content: "Growth",
        evidence: repo("src/server/mcp/config.ts"),
      },
      {
        fieldId: "icon",
        truth: "missing",
        next: "Create a recognizably Wander, small-format plugin mark.",
      },
      {
        fieldId: "promise",
        truth: "draft",
        content:
          "Plan, create, and inspect Wander growth work with the right workspace context.",
        next: "Tighten around the first repeatable operator workflow.",
      },
      {
        fieldId: "capabilities",
        truth: "source_verified",
        content:
          "20 focused tools plus invoke_growth across brands, content, media, audiences, campaigns, newsletters, and analytics.",
        evidence: repo("docs/mcp-capabilities.md"),
      },
      {
        fieldId: "proof",
        truth: "missing",
        next: "Capture a real operator brief-to-reviewed-output flow.",
      },
      {
        fieldId: "setup",
        truth: "source_verified",
        content:
          "OAuth 2.1 protected remote MCP at /api/mcp with organization-bound access.",
        next: "Translate implementation facts into account, permissions, and first-prompt guidance.",
        evidence: repo("docs/mcp-capabilities.md"),
      },
      {
        fieldId: "privacy",
        truth: "verify",
        next: "Verify public policy scope against tools and OAuth access.",
      },
      {
        fieldId: "terms",
        truth: "verify",
        next: "Verify terms and a monitored operator support route.",
      },
    ],
  },
  {
    id: "growth-claude",
    product: "Wander Growth",
    surfaceId: "claude_connector",
    audience: "Wander operators using Claude for marketing work",
    strategy:
      "Give Claude direct, bounded access to the current Growth workspace and its reviewable operations.",
    availability: "private",
    fields: [
      {
        fieldId: "name",
        truth: "source_verified",
        content: "Growth",
        evidence: repo("src/server/mcp/config.ts"),
      },
      {
        fieldId: "icon",
        truth: "missing",
        next: "Prepare a stable connector-directory mark.",
      },
      {
        fieldId: "promise",
        truth: "draft",
        content: "Bring Wander's growth context and tools into Claude.",
        next: "Replace the generic promise with a demonstrated high-value workflow.",
      },
      {
        fieldId: "capabilities",
        truth: "source_verified",
        content:
          "20 focused tools plus invoke_growth; open-world research remains owned by the host.",
        evidence: repo("docs/mcp-capabilities.md"),
      },
      {
        fieldId: "proof",
        truth: "missing",
        next: "Record an authenticated prompt, tool run, review step, and result.",
      },
      {
        fieldId: "endpoint",
        truth: "source_verified",
        content: "Configured public origin + /api/mcp",
        next: "Resolve and live-check the production origin before distributing a connector URL.",
        evidence: repo("src/server/mcp/config.ts"),
      },
      {
        fieldId: "setup",
        truth: "draft",
        content: "Add the endpoint, authenticate, enable relevant tools.",
        next: "Add plan/admin constraints and a first useful prompt.",
      },
      {
        fieldId: "privacy",
        truth: "verify",
        next: "Verify collection, use, retention, and deletion disclosure.",
      },
      {
        fieldId: "review",
        truth: "missing",
        next: "Run the current Anthropic MCP directory policy checklist.",
      },
    ],
  },
];
