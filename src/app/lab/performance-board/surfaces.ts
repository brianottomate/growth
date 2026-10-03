export type Surface = { name: string; path: string; parts: string[] };
export type SurfaceGroup = {
  id: string;
  title: string;
  note: string;
  surfaces: Surface[];
};

export const SURFACE_GROUPS: SurfaceGroup[] = [
  {
    id: "team",
    title: "Team-wide surfaces",
    note: "Across clients · the way into the work",
    surfaces: [
      {
        name: "Dashboard",
        path: "/app/performance",
        parts: [
          "Summary metrics",
          "Client journey",
          "Tracker",
          "Campaign activity",
          "Needs attention",
        ],
      },
      {
        name: "Clients",
        path: "/app/performance/clients",
        parts: [
          "Client cards",
          "Journey board",
          "Search",
          "Commercial & delivery states",
          "Budget",
          "Intake",
          "Checklist",
        ],
      },
      {
        name: "Prospects",
        path: "/app/performance/prospects",
        parts: [
          "Prospect portfolio",
          "Pipeline activity",
          "Account search",
          "Pitch workspace",
          "Intake links",
        ],
      },
      {
        name: "Campaigns",
        path: "/app/performance/campaigns",
        parts: ["Cross-client groups", "Campaign summaries", "Delivery state"],
      },
      {
        name: "Tracker",
        path: "/app/performance/tracker",
        parts: [
          "Commercial terms",
          "Monthly fees & media",
          "Billing",
          "Delivery tracking",
        ],
      },
      {
        name: "Accounts",
        path: "/app/performance/accounts",
        parts: ["Performance account management", "Brand association"],
      },
    ],
  },
  {
    id: "client",
    title: "Client workspace",
    note: "One account · current tab order",
    surfaces: [
      {
        name: "Overview",
        path: "",
        parts: [
          "Readiness checklist",
          "Submission",
          "Media library",
          "Contacts",
          "HubSpot CRM context",
        ],
      },
      {
        name: "Setup",
        path: "/setup",
        parts: [
          "Branding",
          "Brand mark",
          "Brand story",
          "Markets",
          "Personas & seed lists",
          "Hero home",
          "Booking site",
          "Home inventory",
        ],
      },
      {
        name: "Homes & targets",
        path: "/booking",
        parts: ["Home groups", "Featured homes", "Booking targets"],
      },
      {
        name: "Catalog",
        path: "/catalog",
        parts: ["Cards", "Templates", "Previews", "Editing", "Exports"],
      },
      {
        name: "Campaigns",
        path: "/campaigns",
        parts: [
          "Campaign list",
          "Build workspace",
          "Provider details",
          "By-home view",
        ],
      },
      {
        name: "Email",
        path: "/newsletters",
        parts: ["Newsletter list", "Wall", "Reading", "Sender & DNS setup"],
      },
      {
        name: "Settings",
        path: "/settings",
        parts: [
          "Connection links",
          "Ad-account access",
          "Commercial settings",
          "Intake values",
        ],
      },
      {
        name: "Ad studio",
        path: "/ads",
        parts: [
          "Ad ideas",
          "Creative previews",
          "Home & format selection",
          "Upload & review",
        ],
      },
      {
        name: "Pitch",
        path: "/pitch",
        parts: ["Pitch editor", "Media selection", "Visual preview"],
      },
    ],
  },
  {
    id: "detail",
    title: "Deeper surfaces",
    note: "Where the real work gets specific",
    surfaces: [
      {
        name: "Individual campaign",
        path: "/campaigns/{campaignId}",
        parts: ["Campaign build", "Ad sets", "Ads", "Creative review"],
      },
      {
        name: "Campaign by home",
        path: "/campaigns/{campaignId}/by-home",
        parts: ["Per-home campaign view"],
      },
      {
        name: "Provider campaign",
        path: "/campaigns/platform/{platformCampaignId}",
        parts: ["Platform campaign details", "Provider delivery"],
      },
      {
        name: "Home workbench",
        path: "/homes/{propertyId}",
        parts: ["Individual home", "Photos", "Creative & booking context"],
      },
      {
        name: "Home inventory",
        path: "/homes",
        parts: ["Inventory workspace"],
      },
      {
        name: "Submission",
        path: "/submission",
        parts: ["Submission route", "Intake review & application"],
      },
    ],
  },
  {
    id: "references",
    title: "Prototypes & references",
    note: "Prior ideas to compare alongside the current UI",
    surfaces: [
      {
        name: "Real-data prototype",
        path: "/app/performance/prototype",
        parts: [
          "Journey board",
          "Client launch brief",
          "Properties & creative",
          "Audience",
          "Campaign build",
          "Catalog",
        ],
      },
      {
        name: "Mock prototype",
        path: "/app/performance-mock",
        parts: ["Demonstration data", "Pipeline", "Client workspace"],
      },
      {
        name: "CSM portfolio · Adapt",
        path: "https://app.adapt.com/apps/2574580d-c719-42c8-a0f5-c2cbae448973",
        parts: [
          "Owner lenses",
          "Account scoring",
          "Pipeline selection",
          "Signed agreements",
          "HubSpot matching",
        ],
      },
      {
        name: "Shared design system",
        path: "/lab/design-system",
        parts: ["Tokens", "Typography", "Components"],
      },
      {
        name: "Assistant gallery",
        path: "/lab/design-system/chat",
        parts: ["Conversation states", "Tool cards", "Chat UI"],
      },
    ],
  },
  {
    id: "external",
    title: "Client-facing & supporting",
    note: "The edges of the internal workflow",
    surfaces: [
      {
        name: "Sales pitch",
        path: "",
        parts: [
          "Public pitch",
          "Client preview",
          "Prepared from pitch workspace",
        ],
      },
      {
        name: "Intake form",
        path: "",
        parts: [
          "Client details",
          "Homes to advertise",
          "Budget",
          "Assets & guest list",
        ],
      },
      {
        name: "Ad-access grant",
        path: "",
        parts: ["Shared provider access handoff"],
      },
      {
        name: "Account connection",
        path: "/connect/{token}",
        parts: ["Client authorizes account access"],
      },
      {
        name: "Email connection",
        path: "/connect/email/{token}",
        parts: ["Sender verification", "DNS guidance"],
      },
      {
        name: "Assistant & MCP",
        path: "/app/overview",
        parts: [
          "Client creation",
          "Campaign creation",
          "Persona definition",
          "Intake & creative review",
        ],
      },
    ],
  },
];
