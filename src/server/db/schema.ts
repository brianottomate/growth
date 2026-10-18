// ---- RE-EXPORT AUTH SCHEMA ----------------------------------------

// Re-export everything from auth-schema for convenience
export * from "./auth-schema";
export * from "./oauth-provider-schema";

// ---- RE-EXPORT DOMAIN SCHEMAS -------------------------------------
// Each domain lives in its own file; this barrel keeps a single import
// surface so drizzle.config (points here) and the Better Auth augmented
// schema (`import * as schema`) see every table. Add new domains here.
export * from "./ad-account-schema";
export * from "./brand-schema";
export * from "./brand-task-schema";
export * from "./pitch-schema";
export * from "./channel-schema";
export * from "./content-schema";
export * from "./content-pillar-schema";
export * from "./creative-work-schema";
export * from "./email-document-schema";
export * from "./product-storefront-schema";
export * from "./ads-schema";
export * from "./affiliate-schema";
export * from "./conversions-schema";
export * from "./amplification-schema";
export * from "./cadence-schema";
export * from "./funnel-schema";
export * from "./leads-schema";
export * from "./lifecycle-schema";
export * from "./performance-schema";
export * from "./transactional-schema";
export * from "./listening-schema";
export * from "./home-schema";
export * from "./media-schema";
export * from "./pregen-native-schema";
export * from "./website-schema";

export * from "./home-group-schema";
export * from "./client-page-schema";

export * from "./email-audience-schema";
export * from "./email-list-schema";

export * from "./initiative-schema";
export * from "./lifecycle-execution-schema";

export * from "./email-sequence-schema";
export * from "./performance-booking-schema";

export * from "./seed-schema";

export * from "./reference-board-schema";
export * from "./article-revision-schema";

export * from "./content-workbook-schema";
