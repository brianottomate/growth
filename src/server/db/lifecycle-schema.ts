import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, type AnyPgColumn } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { channelTable, deliveryProviderEnum } from "./channel-schema";
import { cleanupStatusEnum } from "./content-schema";
import { createId } from "./utils";

// ---- LIFECYCLE DOMAIN ----------------------------------------------
//
// The strategic layer's mirror of automated messaging that lives in external
// tools (Customer.io campaigns + transactional, later Amplitude). View-only to
// start: we store the run state, semantic kind, and metrics, and link out via
// `externalId` / `externalUrl`. Sends/edits still happen in the provider.
// (See data-model.md §9 and the product-architecture map "Lifecycle".)

// Semantic kind of the automation.
export const lifecycleKindEnum = pgEnum("lifecycle_kind", [
  "onboarding",
  "abandoned_cart",
  "reactivation",
  "revival",
  "transactional",
  "behavioral",
  "broadcast",
  "outbound", // cold prospecting / sales outreach (Instantly, BDR sequences)
  "other",
]);
export type LifecycleKind = (typeof lifecycleKindEnum.enumValues)[number];

// Run state — what the thing is actually doing right now. Includes the
// strategic-layer flags Kristian asked for (planned / paused / needs_fixing).
export const lifecycleRunStateEnum = pgEnum("lifecycle_run_state", [
  "planned",
  "draft",
  "running",
  "paused",
  "stopped",
  "ended",
  "needs_fixing",
]);
export type LifecycleRunState =
  (typeof lifecycleRunStateEnum.enumValues)[number];

// Which product line a journey belongs to. Slugs match the tracking plan's
// workspaces (tracking/packages/core: marketplace | os) so lifecycle programs
// can later be joined against tracked events for trigger validation.
export const lifecycleWorkspaceEnum = pgEnum("lifecycle_workspace", [
  "marketplace", // traveler-side (wander.com marketplace)
  "os", // WanderOS / host-side
  "shared", // spans both (e.g. transactional auth emails)
]);
export type LifecycleWorkspace =
  (typeof lifecycleWorkspaceEnum.enumValues)[number];

// Which external system a step lives on / is delivered by. The strategy layer
// only *tags* this (plus an optional `url` link-out) — no sync dependency.
// Mirrors the ToolId taxonomy in data/message-streams.ts.
export const lifecycleStepSystemEnum = pgEnum("lifecycle_step_system", [
  "customerio",
  "resend", // in-app email (growth app and friends)
  "postmark", // product notification email (monolith os-notifications)
  "outreach",
  "instantly", // cold-email sequences (leads prospecting)
  "amplitude",
  "system", // product/backend (in-app surfaces, webhooks, push)
  "human", // BDR / concierge / manual touch
  "other",
]);
export type LifecycleStepSystem =
  (typeof lifecycleStepSystemEnum.enumValues)[number];

// Delivery surface for a touchpoint.
export const touchpointChannelEnum = pgEnum("touchpoint_channel", [
  "email",
  "sms",
  "push",
  "in_app",
  "bdr_task",
  "slack",
  "webhook",
  "other",
]);
export type TouchpointChannel =
  (typeof touchpointChannelEnum.enumValues)[number];

// ---- STRATEGIC LAYER ("what we want") ------------------------------
//
// A `lifecycle_program` is the intent: the journey we *want* to exist
// ("dormant hosts get a 30-day winback"). The `lifecycle_campaign` mirror is
// the reality. A program is fulfilled by 0..n mirrored campaigns via the
// nullable `programId` FK below — exactly like `initiative` → `campaign`.
// Coverage (covered / planned / drifted / gap) is derived, not stored.

// Where a program is in our own planning, independent of any CIO run state.
export const lifecycleProgramStatusEnum = pgEnum("lifecycle_program_status", [
  "idea", // floated, not committed
  "planned", // committed, want it built
  "active", // we consider this part of the live strategy
  "retired", // intentionally wound down
]);
export type LifecycleProgramStatus =
  (typeof lifecycleProgramStatusEnum.enumValues)[number];

// How badly we want it — drives prioritisation of the gaps.
export const lifecycleProgramPriorityEnum = pgEnum(
  "lifecycle_program_priority",
  ["must_have", "should_have", "nice_to_have"],
);
export type LifecycleProgramPriority =
  (typeof lifecycleProgramPriorityEnum.enumValues)[number];

// Manual state of an individual step — we can't infer whether the email/task
// actually exists, so the operator sets it: planned (intend to build), active
// (live), missing (want it, not built yet — a known hole in the journey).
export const lifecycleStepStatusEnum = pgEnum("lifecycle_step_status", [
  "planned",
  "active",
  "missing",
]);
export type LifecycleStepStatus =
  (typeof lifecycleStepStatusEnum.enumValues)[number];

// Metrics snapshot (inline latest, not time-series) for an automation/touchpoint.
export type LifecycleMetrics = {
  matched?: number; // people who entered
  sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  converted?: number;
  bounced?: number;
};

// ---- LIFECYCLE PROGRAM (the intended journey — "what we want") ----

export const lifecycleProgramTable = pgTable(
  "lifecycle_program",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lp")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(),
    description: t.text(), // the strategic rationale ("why we want this")

    kind: lifecycleKindEnum().default("other").notNull(),
    status: lifecycleProgramStatusEnum().default("planned").notNull(),
    priority: lifecycleProgramPriorityEnum().default("should_have").notNull(),
    workspace: lifecycleWorkspaceEnum().default("marketplace").notNull(),

    // The trigger we *want* this to fire on (e.g. "host_signed_up"). Compared
    // against the linked campaigns' actual `triggerEvent` to spot drift.
    intendedTrigger: t.text(),
    // Delivery surfaces we intend to use (touchpoint-channel slugs).
    intendedChannels: t.jsonb().$type<TouchpointChannel[]>(),
    // How many steps the journey should have, roughly.
    targetTouchpoints: t.integer(),

    metadata: t.jsonb(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("lifecycle_program_brand_idx").on(table.brandId),
    index("lifecycle_program_kind_idx").on(table.kind),
    index("lifecycle_program_status_idx").on(table.status),
    index("lifecycle_program_workspace_idx").on(table.workspace),
  ],
);

export type LifecycleProgram = typeof lifecycleProgramTable.$inferSelect;
export type LifecycleProgramInsert = typeof lifecycleProgramTable.$inferInsert;

// ---- LIFECYCLE PROGRAM STEP (an intended touchpoint we author by hand) ----
//
// The steps of the journey we *want* — a Day-1 email, a BDR task, a Slack
// nudge. Authored directly in the UI for visual confirmation of the plan. A
// step can optionally point at the Customer.io campaign that delivers it
// (`campaignId`) — but that's a loose "exists in CIO" signal, not a 1:1 link
// (one CIO campaign often covers several steps / programs).

export const lifecycleProgramStepTable = pgTable(
  "lifecycle_program_step",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lps")),

    programId: t
      .text()
      .references(() => lifecycleProgramTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(), // e.g. "Welcome email", "BDR intro call"
    channel: touchpointChannelEnum().default("email").notNull(),
    status: lifecycleStepStatusEnum().default("planned").notNull(),
    // Where this step lives / who delivers it (CIO, Outreach, a human…).
    // Null = untagged. Pair with `url` for the manual link-out tie.
    system: lifecycleStepSystemEnum(),
    position: t.integer().default(0).notNull(),
    // Offset from journey start, normalized to minutes (0 = immediately).
    // Steps render/sort by this; the timeline is absolute ("Day 0/2/5").
    delayMinutes: t.integer(),
    // Optional free-text override for non-numeric timing ("next business day").
    // Dormant — no UI yet; derived label from delayMinutes is shown when null.
    delayLabel: t.text(),
    subject: t.text(), // email subject / message gist
    body: t.text(), // the actual authored copy (markdown/HTML) — the spec we review & ship
    url: t.text(), // optional link out to where the resource is defined

    // Branching: a step with a parent hangs off that step as a conditional
    // branch (activity-diagram style) instead of sitting on the main spine.
    // Roots (parent null) ordered by delay/position form the happy path.
    parentStepId: t
      .text()
      .references((): AnyPgColumn => lifecycleProgramStepTable.id, {
        onDelete: "set null",
      }),
    // The branch condition, shown on the edge ("no open after 3d").
    branchLabel: t.text(),

    // Optional: the mirrored CIO campaign that actually sends this step.
    campaignId: t
      .text()
      .references(() => lifecycleCampaignTable.id, { onDelete: "set null" }),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (table) => [index("lifecycle_program_step_program_idx").on(table.programId)],
);

export type LifecycleProgramStep =
  typeof lifecycleProgramStepTable.$inferSelect;
export type LifecycleProgramStepInsert =
  typeof lifecycleProgramStepTable.$inferInsert;

// ---- LIFECYCLE CAMPAIGN (a journey / automation / transactional template) ----

export const lifecycleCampaignTable = pgTable(
  "lifecycle_campaign",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lc")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // Optional primary channel it's delivered through (the newsletter/email
    // channel, etc.). Touchpoints can override per-step.
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    description: t.text(),

    kind: lifecycleKindEnum().default("other").notNull(),
    runState: lifecycleRunStateEnum().default("planned").notNull(),

    // Which external object this mirrors: "campaign" | "transactional".
    externalKind: t.text(),
    triggerEvent: t.text(), // e.g. "Order Completed", "checkout_started"

    provider: deliveryProviderEnum(), // customerio, etc.
    externalId: t.text(),
    externalUrl: t.text(),

    cleanupStatus: cleanupStatusEnum().default("keep").notNull(),

    metrics: t.jsonb().$type<LifecycleMetrics>(),

    startedAt: t.timestamp({ withTimezone: true }),
    lastSentAt: t.timestamp({ withTimezone: true }),

    metadata: t.jsonb(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("lifecycle_campaign_brand_idx").on(table.brandId),
    index("lifecycle_campaign_kind_idx").on(table.kind),
    index("lifecycle_campaign_run_state_idx").on(table.runState),
    index("lifecycle_campaign_cleanup_idx").on(table.cleanupStatus),
    index("lifecycle_campaign_external_idx").on(
      table.provider,
      table.externalId,
    ),
  ],
);

export type LifecycleCampaign = typeof lifecycleCampaignTable.$inferSelect;
export type LifecycleCampaignInsert =
  typeof lifecycleCampaignTable.$inferInsert;

// ---- LIFECYCLE TOUCHPOINT (a step / message inside a journey) ----

export const lifecycleTouchpointTable = pgTable(
  "lifecycle_touchpoint",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lt")),

    campaignId: t
      .text()
      .references(() => lifecycleCampaignTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text(),
    subject: t.text(),
    channel: touchpointChannelEnum().default("email").notNull(),

    position: t.integer().default(0).notNull(), // order within the journey
    delayLabel: t.text(), // human label, e.g. "after 2 days"

    externalId: t.text(),
    metrics: t.jsonb().$type<LifecycleMetrics>(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (table) => [index("lifecycle_touchpoint_campaign_idx").on(table.campaignId)],
);

export type LifecycleTouchpoint = typeof lifecycleTouchpointTable.$inferSelect;
export type LifecycleTouchpointInsert =
  typeof lifecycleTouchpointTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const lifecycleProgramRelations = relations(
  lifecycleProgramTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [lifecycleProgramTable.brandId],
      references: [brandTable.id],
    }),
    steps: many(lifecycleProgramStepTable),
  }),
);

export const lifecycleProgramStepRelations = relations(
  lifecycleProgramStepTable,
  ({ one, many }) => ({
    program: one(lifecycleProgramTable, {
      fields: [lifecycleProgramStepTable.programId],
      references: [lifecycleProgramTable.id],
    }),
    campaign: one(lifecycleCampaignTable, {
      fields: [lifecycleProgramStepTable.campaignId],
      references: [lifecycleCampaignTable.id],
    }),
    parent: one(lifecycleProgramStepTable, {
      fields: [lifecycleProgramStepTable.parentStepId],
      references: [lifecycleProgramStepTable.id],
      relationName: "stepBranches",
    }),
    branches: many(lifecycleProgramStepTable, {
      relationName: "stepBranches",
    }),
  }),
);

export const lifecycleCampaignRelations = relations(
  lifecycleCampaignTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [lifecycleCampaignTable.brandId],
      references: [brandTable.id],
    }),
    channel: one(channelTable, {
      fields: [lifecycleCampaignTable.channelId],
      references: [channelTable.id],
    }),
    touchpoints: many(lifecycleTouchpointTable),
  }),
);

export const lifecycleTouchpointRelations = relations(
  lifecycleTouchpointTable,
  ({ one }) => ({
    campaign: one(lifecycleCampaignTable, {
      fields: [lifecycleTouchpointTable.campaignId],
      references: [lifecycleCampaignTable.id],
    }),
  }),
);
