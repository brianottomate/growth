import "server-only";

import type { StepContext } from "../pipeline";

/**
 * PORT PENDING — implemented against the monolith site-editor spec
 * (see docs/pregen-native-port-spec.md once the pipeline map lands).
 */
export async function crawlStep(_ctx: StepContext) {
  throw new Error("crawlStep not implemented yet (port in progress)");
}
