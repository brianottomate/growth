import { relations, sql } from "drizzle-orm";
import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";

import type { StatusValue } from "./constants";
import { createId } from "./utils";

// ---- ENUMS ---------------------------------------------------------

// Currency enum
export const currencyEnum = pgEnum("currency", [
  "usd",
  "eur",
  "nok",
  "gbp",
  "cad",
]);

// Export TypeScript type for validators
export type Currency = (typeof currencyEnum.enumValues)[number];

// Date format enum
export const dateFormatEnum = pgEnum("date_format", [
  "mm_dd_yyyy", // US format
  "dd_mm_yyyy", // EU format
  "yyyy_mm_dd", // ISO format
]);

// Export TypeScript type for validators
export type DateFormat = (typeof dateFormatEnum.enumValues)[number];

// Unit system enum
export const unitSystemEnum = pgEnum("unit_system", [
  "metric", // meters, celsius, etc.
  "imperial", // feet, fahrenheit, etc.
]);

// Export TypeScript type for validators
export type UnitSystem = (typeof unitSystemEnum.enumValues)[number];

// Organization role enum
export const organizationRoleEnum = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
]);

// Export TypeScript type for validators
export type OrganizationRole = (typeof organizationRoleEnum.enumValues)[number];

// Organization plan enum
export const organizationPlanEnum = pgEnum("organization_plan", [
  "free",
  "pro",
  "enterprise",
]);

// Export TypeScript type for validators
export type OrganizationPlan = (typeof organizationPlanEnum.enumValues)[number];

// ---- BETTER AUTH CORE TABLES ---------------------------------------

// User table (Better Auth compatible with user preferences)
export const userTable = pgTable("user", (t) => ({
  id: t.text().primaryKey(),
  name: t.text(),
  email: t.text(),
  emailVerified: t.boolean().default(false).notNull(),
  image: t.text(),
  // Username plugin fields
  username: t.text().unique(),
  displayUsername: t.text(),
  // Anonymous plugin field
  isAnonymous: t.boolean().default(false),
  // Admin plugin fields
  role: t.text().default("user"),
  banned: t.boolean().default(false),
  banReason: t.text(),
  banExpires: t.timestamp(),
  // User preferences (NEW)
  dateFormat: dateFormatEnum("date_format").default("mm_dd_yyyy"),
  unitSystem: unitSystemEnum("unit_system").default("metric"),
  preferredCurrency: currencyEnum("preferred_currency").default("usd"),
  timeZone: t.text().default("UTC"),
  // Location tracking (populated from geo headers or IP)
  city: t.text(),
  country: t.text(),
  // Onboarding (simple example - customize for your app)
  onboardingCompletedAt: t.timestamp(),
  onboardingSource: t.text().array().default([]), // How they found the app
  createdAt: t
    .timestamp()
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: t
    .timestamp()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
}));

export type User = typeof userTable.$inferSelect;
export type UserInsert = typeof userTable.$inferInsert;

// Session table (with organization context)
export const sessionTable = pgTable(
  "session",
  (t) => ({
    id: t.text().primaryKey(),
    expiresAt: t.timestamp().notNull(),
    token: t.text().notNull().unique(),
    createdAt: t.timestamp().notNull(),
    updatedAt: t.timestamp().notNull(),
    ipAddress: t.text(),
    userAgent: t.text(),
    userId: t
      .text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    // Organization context (NEW)
    activeOrganizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "set null" }),
    activeTeamId: t
      .text()
      .references(() => teamTable.id, { onDelete: "set null" }),
    // Admin plugin field for impersonation tracking
    impersonatedBy: t.text(),
  }),
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export type Session = typeof sessionTable.$inferSelect;
export type SessionInsert = typeof sessionTable.$inferInsert;

// Account table (Better Auth OAuth/credential accounts)
export const accountTable = pgTable(
  "account",
  (t) => ({
    id: t.text().primaryKey(),
    accountId: t.text().notNull(),
    providerId: t.text().notNull(),
    userId: t
      .text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    accessToken: t.text(),
    refreshToken: t.text(),
    idToken: t.text(),
    accessTokenExpiresAt: t.timestamp(),
    refreshTokenExpiresAt: t.timestamp(),
    scope: t.text(),
    password: t.text(),
    createdAt: t.timestamp().notNull(),
    updatedAt: t.timestamp().notNull(),
  }),
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export type Account = typeof accountTable.$inferSelect;
export type AccountInsert = typeof accountTable.$inferInsert;

// Verification table (Better Auth email verification tokens)
export const verificationTable = pgTable(
  "verification",
  (t) => ({
    id: t.text().primaryKey(),
    identifier: t.text().notNull(),
    value: t.text().notNull(),
    expiresAt: t.timestamp().notNull(),
    createdAt: t.timestamp().$defaultFn(() => new Date()),
    updatedAt: t.timestamp().$defaultFn(() => new Date()),
  }),
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export type Verification = typeof verificationTable.$inferSelect;
export type VerificationInsert = typeof verificationTable.$inferInsert;

// ---- ORGANIZATION TABLES -------------------------------------------

// Organization table
export const organizationTable = pgTable(
  "organization",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("org")),
    name: t.text().notNull(),
    slug: t.text().unique(),
    logo: t.text(),
    metadata: t.text(), // JSON string for Better Auth compatibility
    // Billing columns (NEW)
    plan: organizationPlanEnum("plan").default("free").notNull(),
    subscriptionId: t.text("subscription_id"), // Provider subscription ID
    subscriptionStatus: t.text("subscription_status"), // active, cancelled, past_due, etc.
    subscriptionCurrentPeriodEnd: t.timestamp(
      "subscription_current_period_end",
    ),
    subscriptionCancelAt: t.timestamp("subscription_cancel_at"),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp()
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
    deletedAt: t.timestamp("deleted_at"),
  }),
  (table) => [
    index("org_slug_idx")
      .on(table.slug)
      .where(sql`${table.slug} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ],
);

export type Organization = typeof organizationTable.$inferSelect;
export type OrganizationInsert = typeof organizationTable.$inferInsert;

// Member table (organization members)
export const memberTable = pgTable(
  "member",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("mbr")),
    userId: t
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    role: organizationRoleEnum().default("member").notNull(),
    createdAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    index("member_user_id_idx").on(table.userId),
    index("member_org_id_idx").on(table.organizationId),
    index("member_composite_idx").on(table.organizationId, table.userId),
  ],
);

export type Member = typeof memberTable.$inferSelect;
export type MemberInsert = typeof memberTable.$inferInsert;

// Team table (teams within organizations)
export const teamTable = pgTable(
  "team",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("team")),
    name: t.text().notNull(),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp()
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [index("team_org_id_idx").on(table.organizationId)],
);

export type Team = typeof teamTable.$inferSelect;
export type TeamInsert = typeof teamTable.$inferInsert;

// Team member table (team membership)
export const teamMemberTable = pgTable(
  "team_member",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("tmr")),
    teamId: t
      .text()
      .references(() => teamTable.id, { onDelete: "cascade" })
      .notNull(),
    userId: t
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    index("team_member_team_id_idx").on(table.teamId),
    index("team_member_user_id_idx").on(table.userId),
    index("team_member_composite_idx").on(table.teamId, table.userId),
  ],
);

export type TeamMember = typeof teamMemberTable.$inferSelect;
export type TeamMemberInsert = typeof teamMemberTable.$inferInsert;

// Invitation table (organization invitations)
export const invitationTable = pgTable(
  "invitation",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("inv")),
    email: t.text().notNull(),
    role: organizationRoleEnum().default("member").notNull(),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    teamId: t.text().references(() => teamTable.id, { onDelete: "cascade" }), // Optional team assignment
    inviterId: t
      .text()
      .references(() => userTable.id)
      .notNull(),
    expiresAt: t.timestamp(),
    acceptedAt: t.timestamp(),
    status: t.text().$type<StatusValue>().default("pending").notNull(),
    createdAt: t.timestamp().defaultNow().notNull(),
  }),
  (table) => [
    index("invitation_org_id_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export type Invitation = typeof invitationTable.$inferSelect;
export type InvitationInsert = typeof invitationTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const userRelations = relations(userTable, ({ many }) => ({
  accounts: many(accountTable),
  sessions: many(sessionTable),
  memberships: many(memberTable),
  teamMemberships: many(teamMemberTable),
  sentInvitations: many(invitationTable),
}));

export const organizationRelations = relations(
  organizationTable,
  ({ many }) => ({
    members: many(memberTable),
    teams: many(teamTable),
    invitations: many(invitationTable),
  }),
);

export const memberRelations = relations(memberTable, ({ one }) => ({
  user: one(userTable, {
    fields: [memberTable.userId],
    references: [userTable.id],
  }),
  organization: one(organizationTable, {
    fields: [memberTable.organizationId],
    references: [organizationTable.id],
  }),
}));

export const teamRelations = relations(teamTable, ({ one, many }) => ({
  organization: one(organizationTable, {
    fields: [teamTable.organizationId],
    references: [organizationTable.id],
  }),
  members: many(teamMemberTable),
  invitations: many(invitationTable),
}));

export const teamMemberRelations = relations(teamMemberTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamMemberTable.teamId],
    references: [teamTable.id],
  }),
  user: one(userTable, {
    fields: [teamMemberTable.userId],
    references: [userTable.id],
  }),
}));

export const invitationRelations = relations(invitationTable, ({ one }) => ({
  organization: one(organizationTable, {
    fields: [invitationTable.organizationId],
    references: [organizationTable.id],
  }),
  team: one(teamTable, {
    fields: [invitationTable.teamId],
    references: [teamTable.id],
  }),
  inviter: one(userTable, {
    fields: [invitationTable.inviterId],
    references: [userTable.id],
  }),
}));

export const accountRelations = relations(accountTable, ({ one }) => ({
  user: one(userTable, {
    fields: [accountTable.userId],
    references: [userTable.id],
  }),
}));

export const sessionRelations = relations(sessionTable, ({ one }) => ({
  user: one(userTable, {
    fields: [sessionTable.userId],
    references: [userTable.id],
  }),
  activeOrganization: one(organizationTable, {
    fields: [sessionTable.activeOrganizationId],
    references: [organizationTable.id],
  }),
  activeTeam: one(teamTable, {
    fields: [sessionTable.activeTeamId],
    references: [teamTable.id],
  }),
}));
