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
          "Client journey board",
          "Commercial, Creative & Delivery views",
          "Observed launch progress",
          "Suggested next action",
          "Search & card detail modes",
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
          "Account summary",
          "Launch checklist & next action",
          "Submission & intake review",
          "Contacts",
          "CRM contacts",
          "Media library",
        ],
      },
      {
        name: "Setup",
        path: "/setup",
        parts: [
          "Brand identity & typography",
          "Creative mark",
          "General brand preview image",
          "Brand story",
          "Personas & seed lists",
        ],
      },
      {
        name: "WanderOS",
        path: "/wanderos",
        parts: [
          "Featured homes & reusable groups",
          "Destinations",
          "Booking targets",
          "Home inventory & workbenches",
        ],
      },
      {
        name: "Catalog",
        path: "/catalog",
        parts: [
          "Home cards",
          "Templates",
          "Previews",
          "Copy & crop review",
          "Library exports",
        ],
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
        parts: [
          "Newsletter list & previews",
          "Sender & DNS setup",
          "Warehouse email audiences",
        ],
      },
      {
        name: "Settings",
        path: "/settings",
        parts: [
          "WanderOS connection & home sync",
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
      {
        name: "Extra",
        path: "/extra",
        parts: [
          "Client page activity",
          "Additional tools awaiting a permanent home",
        ],
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
        name: "Legacy homes & booking routes",
        path: "/homes",
        parts: [
          "/homes and /booking redirect to WanderOS",
          "Individual home routes remain available",
        ],
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
