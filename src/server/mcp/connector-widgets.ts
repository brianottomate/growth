import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { NEXT_OPTIONS_HTML, NEXT_OPTIONS_URI } from "./next-options-ui";
import {
  SOCIAL_POST_PREVIEW_HTML,
  SOCIAL_POST_PREVIEW_URI,
  MCP_APP_MIME_TYPE,
} from "./social-post-preview-ui";
import {
  CONTENT_CALENDAR_HTML,
  CONTENT_CALENDAR_URI,
  CONTENT_PIPELINE_HTML,
  CONTENT_PIPELINE_URI,
  PRODUCTION_QUEUE_HTML,
  PRODUCTION_QUEUE_URI,
} from "./content-views-ui";
import { AD_PERFORMANCE_HTML, AD_PERFORMANCE_URI } from "./ad-performance-ui";
import {
  WORK_ITEM_HTML,
  WORK_ITEM_URI,
  CAMPAIGN_HTML,
  CAMPAIGN_URI,
  CREATIVE_HTML,
  CREATIVE_URI,
  CATALOG_HTML,
  CATALOG_URI,
  BRANDS_HTML,
  BRANDS_URI,
  PHOTOS_HTML,
  PHOTOS_URI,
} from "./workspace-views-ui";

/** One inventory drives connector metadata, resources, and the private workbench. */
export const CONNECTOR_WIDGETS = [
  {
    id: "workitem",
    title: "Work-item inspector",
    description:
      "Editorial brief, channel drafts, attached media, and readiness in one view.",
    tool: "contentRead__getWorkItem",
    uri: WORK_ITEM_URI,
    html: WORK_ITEM_HTML,
    legacy: true,
  },
  {
    id: "campaign",
    title: "Campaign overview",
    description:
      "Creative, audiences, platform delivery, and the next campaign handoff.",
    tool: "adsRead__openCampaign",
    uri: CAMPAIGN_URI,
    html: CAMPAIGN_HTML,
    legacy: true,
  },
  {
    id: "creative",
    title: "Creative review",
    description:
      "Review copy, slides, source imagery, and composition sketches across placements.",
    tool: "adsRead__ideaContext",
    aliases: ["adsWrite__saveIdea", "adsWrite__draftAd"],
    uri: CREATIVE_URI,
    html: CREATIVE_HTML,
    legacy: true,
  },
  {
    id: "catalog",
    title: "Catalog batch review",
    description:
      "Review the current catalog batch, approval states, and export history.",
    tool: "adsRead__catalogState",
    uri: CATALOG_URI,
    html: CATALOG_HTML,
    legacy: true,
  },
  {
    id: "brands",
    title: "Brand picker + map",
    description: "Search returned brands and inspect their workspace coverage.",
    tool: "brandRead__getMap",
    aliases: ["brandRead__list"],
    uri: BRANDS_URI,
    html: BRANDS_HTML,
    legacy: true,
  },
  {
    id: "photos",
    title: "Listing photo picker",
    description:
      "Browse home imagery and gather a local selection to discuss in chat.",
    tool: "mediaLibraryRead__listingPhotos",
    uri: PHOTOS_URI,
    html: PHOTOS_HTML,
    legacy: true,
  },
  {
    id: "social",
    title: "Social post previews",
    description:
      "Platform-native layouts for reviewing creative, captions, and publishing state.",
    tool: "renderSocialPosts",
    uri: SOCIAL_POST_PREVIEW_URI,
    html: SOCIAL_POST_PREVIEW_HTML,
    legacy: true,
  },
  {
    id: "options",
    title: "Next options",
    description: "Clear follow-up choices with an editable creative direction.",
    tool: "presentNextOptions",
    uri: NEXT_OPTIONS_URI,
    html: NEXT_OPTIONS_HTML,
    legacy: true,
  },
  {
    id: "calendar",
    title: "Content calendar",
    description: "A dated agenda with publishing states and review filters.",
    tool: "contentRead__upcoming",
    uri: CONTENT_CALENDAR_URI,
    html: CONTENT_CALENDAR_HTML,
    legacy: true,
  },
  {
    id: "pipeline",
    title: "Content pipeline",
    description: "Status distribution across work items and standalone posts.",
    tool: "contentRead__pipeline",
    uri: CONTENT_PIPELINE_URI,
    html: CONTENT_PIPELINE_HTML,
    legacy: true,
  },
  {
    id: "production",
    title: "Production queue",
    description:
      "Completion progress, readiness, and the next step for each item.",
    tool: "contentRead__productionQueue",
    uri: PRODUCTION_QUEUE_URI,
    html: PRODUCTION_QUEUE_HTML,
    legacy: true,
  },
  {
    id: "performance",
    title: "Ad performance",
    description:
      "A ranked creative shortlist with delivery metrics and local sorting.",
    tool: "adsRead__top",
    uri: AD_PERFORMANCE_URI,
    html: AD_PERFORMANCE_HTML,
    legacy: true,
  },
] as const;

export function widgetForTool(name: string) {
  return CONNECTOR_WIDGETS.find(
    (widget) =>
      widget.tool === name ||
      ("aliases" in widget && widget.aliases.some((alias) => alias === name)),
  );
}
export function registerConnectorResources(
  server: McpServer,
  resourceDomains: string[],
) {
  for (const widget of CONNECTOR_WIDGETS)
    server.registerResource(
      widget.id,
      widget.uri,
      {
        title: widget.title,
        description: widget.description,
        mimeType: MCP_APP_MIME_TYPE,
      },
      async () => ({
        contents: [
          {
            uri: widget.uri,
            mimeType: MCP_APP_MIME_TYPE,
            text: widget.html,
            _meta: {
              ui: {
                prefersBorder: widget.id !== "options",
                csp: {
                  connectDomains: [],
                  resourceDomains: [
                    "social",
                    "performance",
                    "workitem",
                    "campaign",
                    "creative",
                    "catalog",
                    "photos",
                  ].includes(widget.id)
                    ? resourceDomains
                    : [],
                },
              },
              "openai/widgetDescription": widget.description,
            },
          },
        ],
      }),
    );
}
