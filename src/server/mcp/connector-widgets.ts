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
import { EMAIL_PREVIEW_HTML } from "./email-preview-ui";
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
      "A brief summary and readiness count, with a link to the content workspace.",
    tool: "contentRead__getWorkItem",
    uri: WORK_ITEM_URI,
    html: WORK_ITEM_HTML,
    legacy: true,
  },
  {
    id: "campaign",
    title: "Campaign overview",
    description:
      "Creative and audience counts, with a link to the full campaign.",
    tool: "adsRead__openCampaign",
    uri: CAMPAIGN_URI,
    html: CAMPAIGN_HTML,
    legacy: true,
  },
  {
    id: "creative",
    title: "Creative review",
    description:
      "The creative at card width with its headline, first line and status, with a link to the ad in Growth.",
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
      "Batch counts and approval status, with a link to the catalog.",
    tool: "adsRead__catalogState",
    uri: CATALOG_URI,
    html: CATALOG_HTML,
    legacy: true,
  },
  {
    id: "brands",
    title: "Brand picker + map",
    description:
      "A short brand list with workspace links and a conversational choice.",
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
      "A few home thumbnails, with a link to browse imagery in Growth.",
    tool: "mediaLibraryRead__listingPhotos",
    uri: PHOTOS_URI,
    html: PHOTOS_HTML,
    legacy: true,
  },
  {
    id: "email",
    title: "Email",
    description:
      "Newsletter and broadcast previews with subject, preheader, creative approval and delivery status.",
    tool: "emailRead__get",
    uri: "ui://wander-growth/email-preview/v1.html",
    html: EMAIL_PREVIEW_HTML,
    legacy: true,
  },
  {
    id: "social",
    title: "Social post previews",
    description:
      "Compact post summaries with links to review the full creative in Growth.",
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
    description: "Planning-window counts, with a link to the full calendar.",
    tool: "contentRead__upcoming",
    uri: CONTENT_CALENDAR_URI,
    html: CONTENT_CALENDAR_HTML,
    legacy: true,
  },
  {
    id: "pipeline",
    title: "Content pipeline",
    description:
      "Pipeline totals and review counts, with a link to the content board.",
    tool: "contentRead__pipeline",
    uri: CONTENT_PIPELINE_URI,
    html: CONTENT_PIPELINE_HTML,
    legacy: true,
  },
  {
    id: "production",
    title: "Production queue",
    description:
      "Readiness counts and a short work list, with links into production.",
    tool: "contentRead__productionQueue",
    uri: PRODUCTION_QUEUE_URI,
    html: PRODUCTION_QUEUE_HTML,
    legacy: true,
  },
  {
    id: "performance",
    title: "Ad performance",
    description:
      "A short creative ranking, with a link to full performance metrics.",
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
                prefersBorder: !["options", "brands"].includes(widget.id),
                csp: {
                  connectDomains: [],
                  ...(widget.id === "email"
                    ? { frameDomains: ["about:"] }
                    : {}),
                  resourceDomains: [
                    "email",
                    "social",
                    "performance",
                    "workitem",
                    "campaign",
                    "creative",
                    "catalog",
                    "photos",
                  ].includes(widget.id)
                    ? widget.id === "email"
                      ? [
                          ...resourceDomains,
                          "https://fonts.googleapis.com",
                          "https://fonts.gstatic.com",
                        ]
                      : resourceDomains
                    : widget.id === "brands"
                      ? [...resourceDomains, "https://www.wander.com"]
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
