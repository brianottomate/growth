import type { GrowthExecutionContext } from "./tool";
import {
  getToolName,
  isToolUIPart,
  tool,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";

const domains = {
  performance: [
    "adsRead",
    "adsWrite",
    "performanceRead",
    "performanceWrite",
    "personaRead",
    "personaWrite",
  ],
  content: [
    "contentRead",
    "contentWrite",
    "contentMediaWrite",
    "contentStrategyRead",
    "contentStrategyWrite",
    "strategyRead",
    "strategyWrite",
    "planningRead",
    "planningWrite",
    "publishingRead",
    "publishingWrite",
    "renderSocialPosts",
    "prepareProductionPacket",
  ],
  email: [
    "emailRead",
    "emailWrite",
    "newsletterAgent",
    "lifecycleRead",
    "lifecycleWrite",
  ],
  leads: ["leadsRead", "leadsWrite"],
  listening: [
    "listeningRead",
    "sourceSyncWrite",
    "amplificationRead",
    "amplificationWrite",
  ],
  product: [
    "productAtlasRead",
    "productAtlasWrite",
    "storefrontRead",
    "storefrontWrite",
  ],
  research: ["researchRead", "driveRead", "blogAgent"],
} as const;
type Domain = keyof typeof domains;
const domainSchema = z.enum([
  "performance",
  "content",
  "email",
  "leads",
  "listening",
  "product",
  "research",
]);
const pitchOperations = new Set([
  "performanceRead__pitch",
  "performanceRead__draftPitch",
  "performanceWrite__savePitch",
]);

const common = new Set([
  "initiativeRead",
  "initiativeWrite",
  "creativeRead",
  "creativeWrite",
  "presentNextOptions",
  "workspaceOverview",
  "navigateWorkspace",
  "operationRead",
  "brandRead",
  "brandWrite",
  "mediaLibraryRead",
  "mediaLibraryWrite",
  "mediaAnalysisRead",
  "mediaAnalysisWrite",
  "playbookRead",
  "sessionRead",
]);
export function createChatToolScope(input: {
  tools: ToolSet;
  pagePath?: string;
  performance?: boolean;
  pitch?: boolean;
  content?: boolean;
  email?: boolean;
  continuation: UIMessage;
  focus?:
    | "catalog"
    | "creative"
    | "photos"
    | "ads"
    | "audiences"
    | "platforms"
    | "live"
    | "copy";
}) {
  const selected = new Set<Domain>();
  let performanceExpanded = false;
  if (input.pitch) selected.add("research");
  if (input.email) selected.add("email");
  if (/\/initiatives(\/|$)/.test(input.pagePath ?? "")) {
    selected.add("performance");
    selected.add("content");
    selected.add("email");
    selected.add("research");
  }
  const path = input.pagePath?.split(/[?#]/)[0] ?? "";
  if (input.performance || /\/(performance|ads|campaigns)(\/|$)/.test(path))
    selected.add("performance");
  if (
    input.content ||
    /\/(content|calendar|series|strategy|planning|feed|review|channels)(\/|$)/.test(
      path,
    )
  )
    selected.add("content");
  if (/\/(newsletters|email|lifecycle)(\/|$)/.test(path)) selected.add("email");
  if (/\/leads(\/|$)/.test(path)) selected.add("leads");
  if (/\/(listening|amplification)(\/|$)/.test(path)) selected.add("listening");
  if (/\/(products|product-atlas|apps|storefronts)(\/|$)/.test(path))
    selected.add("product");
  if (/\/blog(\/|$)/.test(path)) {
    selected.add("research");
    selected.add("content");
  }
  if (/\/audiences(\/|$)/.test(path)) selected.add("performance");
  const pending = new Set(
    input.continuation.parts.flatMap((part) =>
      isToolUIPart(part) && part.state === "approval-responded"
        ? [getToolName(part)]
        : [],
    ),
  );
  const domainInputSchema = z.object({ domain: domainSchema });
  const selectToolDomain = tool<
    z.infer<typeof domainInputSchema>,
    { enabled: z.infer<typeof domainSchema>; note: string },
    GrowthExecutionContext
  >({
    description:
      "Enable another Growth tool domain when the task crosses sections. Domains: performance (sales pitches, client accounts, ads, catalogs, campaigns), content (posts, calendar, strategy, publishing), email (newsletters and lifecycle), leads, listening, product (atlas, storefronts), research (web, Drive, blogs). This changes tool availability only and authorizes no edits.",
    inputSchema: domainInputSchema,
    execute: async ({ domain }) => {
      selected.add(domain);
      if (domain === "performance") performanceExpanded = true;
      return {
        enabled: domain,
        note: "Use toolSearch to find its singular operation.",
      };
    },
  });
  const focus =
    input.focus ?? (/\/catalog(\/|$)/.test(path) ? "catalog" : undefined);
  const focusOperations: Record<string, string[]> = {
    catalog: [
      "adsRead__catalogState",
      "adsRead__catalogHomeFacts",
      "adsRead__catalogWriteStatus",
      "adsWrite__editCatalogCard",
      "adsWrite__setHomeHero",
      "adsWrite__newCatalogCopy",
      "adsWrite__newCatalogPhoto",
      "adsWrite__freezeCatalog",
      "adsWrite__setCatalogDefaultTemplate",
      "adsWrite__setCatalogAdCopy",
      "adsWrite__setCatalogAdCopy",
      "performanceRead__reviewPortfolio",
    ],
    creative: [
      "adsRead__ideaContext",
      "adsRead__ideaHomePhotos",
      "adsRead__openCampaign",
      "adsWrite__saveIdea",
      "adsWrite__setAdStatus",
      "adsWrite__editApprovedAd",
      "adsWrite__setAdCopy",
      "adsWrite__setPlacementCopy",
      "adsWrite__clearPlacement",
      "adsWrite__unfreezePlacement",
    ],
    ads: [
      "adsRead__openCampaign",
      "adsRead__ideaContext",
      "adsRead__ideaHomePhotos",
      "adsWrite__draftAd",
      "adsWrite__saveIdea",
      "adsWrite__setAdStatus",
      "adsWrite__editApprovedAd",
      "adsWrite__setAdCopy",
      "adsWrite__setAdHome",
    ],
    photos: [
      "adsRead__openCampaign",
      "adsRead__ideaHomePhotos",
      "adsWrite__setCreativePool",
    ],
    audiences: [
      "adsRead__openCampaign",
      "adsRead__suggestCampaignAudiences",
      "adsWrite__addAudience",
      "adsWrite__updateAudience",
      "adsWrite__linkAudience",
    ],
    platforms: [
      "adsRead__openCampaign",
      "adsRead__listDestinations",
      "adsWrite__planPlatform",
      "adsWrite__setPlatformDraft",
      "adsWrite__setGoogleSettings",
      "adsWrite__push",
    ],
    live: [
      "adsRead__openCampaign",
      "adsRead__top",
      "adsRead__diagnoseAlignment",
      "adsWrite__setDelivery",
    ],
  };
  focusOperations.copy = focusOperations.creative ?? [];
  const performanceCapabilities = new Set<string>(domains.performance);
  return {
    selectToolDomain,
    activeTools: () => {
      const capabilities = new Set<string>([
        ...common,
        ...[...selected].flatMap((domain) => [...domains[domain]]),
      ]);
      return [
        ...Object.keys(input.tools).filter(
          (name) =>
            pending.has(name) ||
            (input.pitch && pitchOperations.has(name)) ||
            (capabilities.has(name.split("__", 1)[0] ?? "") &&
              (!focus ||
                performanceExpanded ||
                !performanceCapabilities.has(name.split("__", 1)[0] ?? "") ||
                (focusOperations[focus] ?? []).includes(name))),
        ),
        "selectToolDomain",
        "inspectCreative",
        "toolSearch",
      ];
    },
  };
}
