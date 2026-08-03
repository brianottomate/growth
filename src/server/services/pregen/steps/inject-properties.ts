import "server-only";

import type { StepContext } from "../pipeline";

/**
 * PORT PENDING — implemented against the monolith site-editor spec
 * (see docs/pregen-native-port-spec.md once the pipeline map lands).
 */
export async function injectPropertiesStep(_ctx: StepContext) {
  throw new Error("injectPropertiesStep not implemented yet (port in progress)");
}
