// ---- RE-EXPORT AUTH SCHEMA ----------------------------------------

// Re-export everything from auth-schema for convenience
export * from "./auth-schema";

// ---- RE-EXPORT DOMAIN SCHEMAS -------------------------------------
// Each domain lives in its own file; this barrel keeps a single import
// surface so drizzle.config (points here) and the Better Auth augmented
// schema (`import * as schema`) see every table. Add new domains here.
export * from "./ad-account-schema";
export * from "./brand-schema";
export * from "./channel-schema";
export * from "./content-schema";
export * from "./plan-import-schema";
export * from "./ads-schema";
export * from "./affiliate-schema";
export * from "./conversions-schema";
export * from "./amplification-schema";
export * from "./cadence-schema";
export * from "./leads-schema";
export * from "./lifecycle-schema";
export * from "./listening-schema";
export * from "./media-schema";
export * from "./website-schema";
