import "server-only";

export type GrowthToolDomain =
  | "overview"
  | "brands"
  | "audiences"
  | "content"
  | "leads"
  | "lifecycle"
  | "listening"
  | "ads"
  | "research"
  | "operations";

export type GrowthToolConsequence =
  | "local-read"
  | "provider-read"
  | "model-read"
  | "model-write"
  | "local-write"
  | "provider-write"
  | "background-run";

export interface GrowthToolPolicy {
  domain: GrowthToolDomain;
  access: "organization-member";
  consequence: GrowthToolConsequence;
  approval: "none" | "user";
  idempotent: boolean;
  reversible: boolean;
  mcp: boolean;
  undoWith?: string;
}

export type GrowthToolPolicyOverride = Partial<
  Omit<GrowthToolPolicy, "domain" | "access">
>;

export interface GrowthActionPolicy {
  default: GrowthToolPolicy;
  actions: Record<string, GrowthToolPolicyOverride>;
}

export type GrowthToolPolicyDefinition = GrowthToolPolicy | GrowthActionPolicy;

const read = (
  domain: GrowthToolDomain,
  consequence: GrowthToolConsequence = "local-read",
  mcp = true,
): GrowthToolPolicy => ({
  domain,
  access: "organization-member",
  consequence,
  approval: "none",
  idempotent: true,
  reversible: false,
  mcp,
});

const write = (
  domain: GrowthToolDomain,
  options: Partial<Omit<GrowthToolPolicy, "domain" | "access">> = {},
): GrowthToolPolicy => ({
  domain,
  access: "organization-member",
  consequence: options.consequence ?? "local-write",
  approval: options.approval ?? "none",
  idempotent: options.idempotent ?? false,
  reversible: options.reversible ?? true,
  mcp: options.mcp ?? true,
  ...(options.undoWith ? { undoWith: options.undoWith } : {}),
});

/**
 * Group related operations under one tool without flattening their safety
 * semantics. The tool input must use a string `action` discriminator.
 */
export const byAction = (
  defaultPolicy: GrowthToolPolicy,
  actions: Record<string, GrowthToolPolicyOverride>,
): GrowthActionPolicy => ({ default: defaultPolicy, actions });

/**
 * Cross-cutting behavior only. AI SDK tools remain the executable source of
 * truth. Growth drafts, plans, and reversible workspace edits run immediately;
 * future external publish/send tools must opt into user approval here.
 */
export const growthToolPolicies = {
  workspaceOverview: read("overview"),
  navigateWorkspace: read("overview"),
  brandsRead: read("brands"),
  audiencesRead: read("audiences"),
  audiencesWrite: byAction(write("audiences"), {
    saveAudienceTargets: { idempotent: true },
    updateAudienceActivation: { idempotent: true },
    updateAudienceTarget: { idempotent: true },
  }),
  researchRead: read("research", "provider-read", false),
  contentRead: byAction(read("content"), {
    suggestMediaForContent: { consequence: "model-read" },
  }),
  contentWrite: byAction(write("content"), {
    updateContentWorkItem: { idempotent: true },
    attachChatImageToContent: { idempotent: true },
    attachLibraryMediaToContent: { idempotent: true },
    recoverArchiveMediaToContent: { consequence: "provider-write" },
    promotePlatformPost: { reversible: false },
  }),
  emailRead: read("content"),
  emailWrite: byAction(write("content"), {
    updateEmailDraft: { idempotent: true },
    generateEmailDraft: {
      consequence: "background-run",
      reversible: true,
    },
  }),
  contentStrategyRead: read("content"),
  contentStrategyWrite: byAction(write("content"), {
    saveContentPillar: { idempotent: true },
    saveContentSeries: { idempotent: true },
    organizeContentIdeas: { idempotent: true },
    resolveContentGrouping: { idempotent: true },
  }),
  adsRead: read("ads", "provider-read"),
  operationsRead: byAction(read("operations", "provider-read"), {
    proposeStrategyTargets: { consequence: "model-read" },
  }),
  sourceSyncWrite: write("operations", {
    consequence: "background-run",
    reversible: false,
  }),
  contentAnalysisWrite: byAction(
    write("operations", { consequence: "model-write" }),
    {
      proposeContentGroupings: { consequence: "model-read" },
    },
  ),
  strategyWrite: byAction(write("operations"), {
    updateChannelCadence: { idempotent: true },
    updateBrandMix: { idempotent: true },
  }),
  planningRead: read("content", "model-read"),
  planningWrite: write("content"),
  leadsSummary: read("leads"),
  lifecycleRead: read("lifecycle"),
  lifecycleWrite: byAction(write("lifecycle"), {
    update_program: { idempotent: true },
    update_step: { idempotent: true },
    link_campaign: { idempotent: true },
    set_cleanup_status: { idempotent: true },
    archive_program: { idempotent: true },
    restore_program: { idempotent: true },
  }),
  recentMentions: read("listening"),
} as const satisfies Record<string, GrowthToolPolicyDefinition>;

export type GrowthToolName = keyof typeof growthToolPolicies;

function isActionPolicy(
  definition: GrowthToolPolicyDefinition,
): definition is GrowthActionPolicy {
  return "default" in definition && "actions" in definition;
}

export function policyForGrowthTool(
  name: string,
  input?: unknown,
): GrowthToolPolicy {
  const definition = (
    growthToolPolicies as Record<string, GrowthToolPolicyDefinition>
  )[name];
  if (!definition) throw new Error(`Missing Growth tool policy for ${name}`);
  if (!isActionPolicy(definition)) return definition;

  const action =
    typeof input === "object" &&
    input !== null &&
    "action" in input &&
    typeof input.action === "string"
      ? input.action
      : undefined;
  const override = action ? definition.actions[action] : undefined;
  return { ...definition.default, ...override };
}
