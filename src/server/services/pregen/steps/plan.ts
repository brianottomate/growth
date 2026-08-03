import "server-only";

import type { StepContext } from "../pipeline";

/**
 * PORT PENDING — implemented against the monolith site-editor spec
 * (see docs/pregen-native-port-spec.md once the pipeline map lands).
 */
export async function planStep(_ctx: StepContext) {
  throw new Error("planStep not implemented yet (port in progress)");
}
