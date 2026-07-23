import { defineAgent } from "eve";
import { anthropic } from "@ai-sdk/anthropic";

/**
 * Direct-provider model so the spike runs with the ANTHROPIC_API_KEY already
 * in growth/.env. Swap to the gateway string ("anthropic/claude-sonnet-5")
 * if/when this deploys to Vercel with AI_GATEWAY_API_KEY.
 */
export default defineAgent({
  model: anthropic("claude-sonnet-5"),
});
