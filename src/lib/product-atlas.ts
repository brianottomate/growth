import { z } from "zod";

export const productLifecycleStatuses = [
  "concept",
  "active",
  "retired",
] as const;
export type ProductLifecycleStatus = (typeof productLifecycleStatuses)[number];

export const storefrontSurfaceIds = [
  "apple_app_store",
  "google_play_store",
  "chrome_web_store",
  "chatgpt_connector",
  "claude_connector",
  "zoom_app_marketplace",
] as const;
export type StorefrontSurfaceId = (typeof storefrontSurfaceIds)[number];

export const storefrontSurfaceRegistry = {
  apple_app_store: {
    label: "Apple App Store",
    shortLabel: "App Store",
    family: "mobile_app_store",
  },
  google_play_store: {
    label: "Google Play Store",
    shortLabel: "Google Play",
    family: "mobile_app_store",
  },
  chrome_web_store: {
    label: "Chrome Web Store",
    shortLabel: "Chrome",
    family: "browser_extension_store",
  },
  chatgpt_connector: {
    label: "ChatGPT plugin",
    shortLabel: "ChatGPT",
    family: "assistant_connector",
  },
  claude_connector: {
    label: "Claude connector",
    shortLabel: "Claude",
    family: "assistant_connector",
  },
  zoom_app_marketplace: {
    label: "Zoom App Marketplace",
    shortLabel: "Zoom",
    family: "workplace_marketplace",
  },
} as const satisfies Record<
  StorefrontSurfaceId,
  { label: string; shortLabel: string; family: string }
>;

export const storefrontListingStatuses = [
  "unknown",
  "draft",
  "testflight",
  "submitted",
  "live",
  "paused",
  "retired",
] as const;
export type StorefrontListingStatus =
  (typeof storefrontListingStatuses)[number];

export const storefrontFreshnessStatuses = [
  "unknown",
  "stale",
  "up_to_date",
] as const;
export type StorefrontFreshnessStatus =
  (typeof storefrontFreshnessStatuses)[number];

const atlasId = z.string().trim().min(1).max(100);

export const atlasJobSchema = z.object({
  id: atlasId,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
});

export const atlasStorySchema = z.object({
  id: atlasId,
  jobId: atlasId.optional(),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2_000).optional(),
});

export const atlasJourneyStepSchema = z.object({
  id: atlasId,
  name: z.string().trim().min(1).max(160),
  order: z.number().int().min(0),
  storyIds: z.array(atlasId).default([]),
});

export const atlasJourneySchema = z.object({
  id: atlasId,
  jobId: atlasId,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  steps: z.array(atlasJourneyStepSchema).default([]),
});

export const atlasSurfaceSchema = z.object({
  id: atlasId,
  name: z.string().trim().min(1).max(160),
  kind: z.enum([
    "web",
    "ios",
    "android",
    "browser_extension",
    "assistant",
    "api",
    "other",
  ]),
});

export const atlasViewSchema = z.object({
  id: atlasId,
  surfaceId: atlasId,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  reference: z
    .object({
      kind: z.enum([
        "route",
        "screen",
        "component",
        "conversation",
        "tool",
        "other",
      ]),
      value: z.string().trim().min(1).max(500),
    })
    .optional(),
  webPageId: z.string().trim().min(1).optional(),
});

export const atlasStoryViewLinkSchema = z.object({
  id: atlasId,
  storyId: atlasId,
  viewId: atlasId,
});

export const atlasTargetTypeSchema = z.enum([
  "product",
  "job",
  "journey",
  "story",
  "surface",
  "view",
  "story_view_link",
]);

export const atlasImplementationRefSchema = z.object({
  id: atlasId,
  targetType: atlasTargetTypeSchema,
  targetId: atlasId,
  kind: z.enum([
    "route",
    "component",
    "repository",
    "document",
    "api",
    "other",
  ]),
  label: z.string().trim().min(1).max(240),
  href: z.string().trim().url().optional(),
});

export const atlasObservationSchema = z.object({
  id: atlasId,
  targetType: atlasTargetTypeSchema,
  targetId: atlasId,
  state: z.enum([
    "observed_live",
    "found_in_code",
    "historical",
    "inferred",
    "confirmed_by_person",
  ]),
  note: z.string().trim().max(2_000).optional(),
  sourceUrl: z.string().trim().url().optional(),
  observedAt: z.string().datetime().optional(),
});

function duplicateIds<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return true;
      seen.add(item.id);
      return false;
    })
    .map((item) => item.id);
}

export const productAtlasSchema = z
  .object({
    jobs: z.array(atlasJobSchema).default([]),
    journeys: z.array(atlasJourneySchema).default([]),
    stories: z.array(atlasStorySchema).default([]),
    surfaces: z.array(atlasSurfaceSchema).default([]),
    views: z.array(atlasViewSchema).default([]),
    storyViewLinks: z.array(atlasStoryViewLinkSchema).default([]),
    implementationRefs: z.array(atlasImplementationRefSchema).default([]),
    observations: z.array(atlasObservationSchema).default([]),
  })
  .superRefine((atlas, ctx) => {
    const collections = [
      ["job", atlas.jobs],
      ["journey", atlas.journeys],
      ["story", atlas.stories],
      ["surface", atlas.surfaces],
      ["view", atlas.views],
      ["story/view link", atlas.storyViewLinks],
      ["implementation reference", atlas.implementationRefs],
      ["observation", atlas.observations],
    ] as const;
    for (const [label, items] of collections) {
      for (const id of duplicateIds(items as { id: string }[])) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate ${label} id: ${id}`,
        });
      }
    }

    const jobIds = new Set(atlas.jobs.map((item) => item.id));
    const storyIds = new Set(atlas.stories.map((item) => item.id));
    const surfaceIds = new Set(atlas.surfaces.map((item) => item.id));
    const viewIds = new Set(atlas.views.map((item) => item.id));
    const storyViewLinkIds = new Set(
      atlas.storyViewLinks.map((item) => item.id),
    );

    for (const story of atlas.stories) {
      if (story.jobId && !jobIds.has(story.jobId)) {
        ctx.addIssue({
          code: "custom",
          message: `Story ${story.id} references missing job ${story.jobId}`,
        });
      }
    }
    for (const journey of atlas.journeys) {
      if (!jobIds.has(journey.jobId)) {
        ctx.addIssue({
          code: "custom",
          message: `Journey ${journey.id} references missing job ${journey.jobId}`,
        });
      }
      for (const step of journey.steps) {
        for (const storyId of step.storyIds) {
          if (!storyIds.has(storyId)) {
            ctx.addIssue({
              code: "custom",
              message: `Journey step ${step.id} references missing story ${storyId}`,
            });
          }
        }
      }
    }
    for (const view of atlas.views) {
      if (!surfaceIds.has(view.surfaceId)) {
        ctx.addIssue({
          code: "custom",
          message: `View ${view.id} references missing surface ${view.surfaceId}`,
        });
      }
    }
    for (const link of atlas.storyViewLinks) {
      if (!storyIds.has(link.storyId) || !viewIds.has(link.viewId)) {
        ctx.addIssue({
          code: "custom",
          message: `Story/view link references a missing node: ${link.storyId} → ${link.viewId}`,
        });
      }
    }
    const targetExists = (targetType: string, targetId: string) => {
      if (targetType === "product") return true;
      if (targetType === "job") return jobIds.has(targetId);
      if (targetType === "journey")
        return atlas.journeys.some((item) => item.id === targetId);
      if (targetType === "story") return storyIds.has(targetId);
      if (targetType === "surface") return surfaceIds.has(targetId);
      if (targetType === "view") return viewIds.has(targetId);
      if (targetType === "story_view_link")
        return storyViewLinkIds.has(targetId);
      return false;
    };
    for (const reference of atlas.implementationRefs) {
      if (!targetExists(reference.targetType, reference.targetId)) {
        ctx.addIssue({
          code: "custom",
          message: `Implementation reference ${reference.id} targets missing ${reference.targetType} ${reference.targetId}`,
        });
      }
    }
    for (const observation of atlas.observations) {
      if (!targetExists(observation.targetType, observation.targetId)) {
        ctx.addIssue({
          code: "custom",
          message: `Observation ${observation.id} targets missing ${observation.targetType} ${observation.targetId}`,
        });
      }
    }
  });

export type ProductAtlas = z.infer<typeof productAtlasSchema>;
export const emptyProductAtlas: ProductAtlas = {
  jobs: [],
  journeys: [],
  stories: [],
  surfaces: [],
  views: [],
  storyViewLinks: [],
  implementationRefs: [],
  observations: [],
};

export const storefrontScreenshotSchema = z.object({
  id: atlasId,
  mediaAssetId: z.string().trim().min(1),
  order: z.number().int().min(0),
  title: z.string().trim().max(160).optional(),
  caption: z.string().trim().max(500).optional(),
  altText: z.string().trim().max(500).optional(),
  device: z.string().trim().max(100).optional(),
  presentation: z.enum(["product_ui", "marketing_composite"]),
});

export const storefrontPromotionalAssetSchema = z.object({
  id: atlasId,
  mediaAssetId: z.string().trim().min(1),
  role: z.string().trim().min(1).max(100),
  order: z.number().int().min(0),
});

export const storefrontVideoSchema = z.object({
  id: atlasId,
  mediaAssetId: z.string().trim().min(1),
  role: z.string().trim().min(1).max(100),
  order: z.number().int().min(0),
});

export const storefrontContentSchema = z.object({
  positioning: z.object({
    audience: z.string().trim().max(2_000).default(""),
    valueProposition: z.string().trim().max(2_000).default(""),
    category: z.string().trim().max(160).default(""),
    keyMessages: z.array(z.string().trim().min(1).max(500)).default([]),
  }),
  copy: z.object({
    displayName: z.string().trim().max(160).default(""),
    shortDescription: z.string().trim().max(500).default(""),
    longDescription: z.string().trim().max(10_000).default(""),
    tagline: z.string().trim().max(500).default(""),
    keywords: z.array(z.string().trim().min(1).max(160)).default([]),
    supportText: z.string().trim().max(5_000).default(""),
    releaseNotes: z.string().trim().max(5_000).default(""),
  }),
  iconMediaAssetId: z.string().trim().min(1).nullable().default(null),
  screenshots: z.array(storefrontScreenshotSchema).default([]),
  promotionalAssets: z.array(storefrontPromotionalAssetSchema).default([]),
  videos: z.array(storefrontVideoSchema).default([]),
  platformFields: z
    .record(
      z.string(),
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
        z.null(),
      ]),
    )
    .default({}),
});

export type StorefrontContent = z.infer<typeof storefrontContentSchema>;
export const emptyStorefrontContent: StorefrontContent = {
  positioning: {
    audience: "",
    valueProposition: "",
    category: "",
    keyMessages: [],
  },
  copy: {
    displayName: "",
    shortDescription: "",
    longDescription: "",
    tagline: "",
    keywords: [],
    supportText: "",
    releaseNotes: "",
  },
  iconMediaAssetId: null,
  screenshots: [],
  promotionalAssets: [],
  videos: [],
  platformFields: {},
};

export const storefrontChangeActions = [
  "created",
  "content_updated",
  "links_updated",
  "marked_stale",
  "confirmed_up_to_date",
  "manager_changed",
  "content_copied",
] as const;

export const storefrontChangeSchema = z.object({
  at: z.string().datetime(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorKind: z.enum(["human", "agent", "seed"]),
  action: z.enum(storefrontChangeActions),
  note: z.string().max(2_000).optional(),
  changedPaths: z.array(z.string()).default([]),
});
export type StorefrontChange = z.infer<typeof storefrontChangeSchema>;

export function storefrontMediaAssetIds(content: StorefrontContent) {
  return [
    content.iconMediaAssetId,
    ...content.screenshots.map((item) => item.mediaAssetId),
    ...content.promotionalAssets.map((item) => item.mediaAssetId),
    ...content.videos.map((item) => item.mediaAssetId),
  ].filter((id): id is string => Boolean(id));
}

export function atlasWebPageIds(atlas: ProductAtlas) {
  return atlas.views
    .map((view) => view.webPageId)
    .filter((id): id is string => Boolean(id));
}
