/**
 * The prompt bank: every prompt text the code builds, in one place, so
 * wording can be read, tuned and checked for duplication without hunting
 * through services and routes.
 *
 * Two kinds of text live in this app, and they split cleanly:
 * - Prompts (here) are built by code and sent with a call. Each is a
 *   function whose typed, documented arguments are the parts a call site
 *   injects: ids, facts, the brand story. A base prompt with no arguments
 *   is a constant.
 * - Playbooks (`content/playbooks/*.md`) are procedures the agent reads
 *   itself with playbookRead, step by step, like a skill. Code never
 *   interpolates them.
 */
export * from "./brand-story";
export * from "./catalog-copy";
export * from "./catalog-home";
export * from "./catalog-quick-fix";
export * from "./featured-homes";
export * from "./markets";
export * from "./portfolio-review";
export * from "./triggered-intents";
