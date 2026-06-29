import "server-only";

import type { z } from "zod";

/**
 * Capability registry — the single source of truth for what the agents can DO.
 *
 * A capability is defined ONCE here (name + description + input schema + a pure
 * handler) and then adapted to whatever surface needs it:
 *   - the in-app chat agents, via `toAiTools()` → AI SDK `tool()` objects
 *   - (later) an MCP server, via an `toMcpTools()` adapter over the same list
 *
 * This is deliberately one step past Homi, which keeps its chat tools and MCP
 * tools as two parallel definitions that merely share a service layer. Defining
 * the capability once means the chat agent and the MCP surface can never drift.
 *
 * Keep handlers org-scoped where the data is org-scoped (brands, content) and
 * note that some domains (leads, listening) are single-tenant/global in this
 * app — those handlers can ignore `ctx.orgId`.
 */
export interface CapabilityContext {
  orgId: string;
  userId: string;
}

export type CapabilityDomain =
  | "overview"
  | "brands"
  | "content"
  | "leads"
  | "listening"
  | "ads";

export interface Capability<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O = unknown,
> {
  /** Stable tool name exposed to the model / MCP client (camelCase). */
  name: string;
  /** What it does + when to call it. Written for the model to read. */
  description: string;
  inputSchema: I;
  /**
   * Read-only vs mutating. Everything is read-only today; this flag is what a
   * future write capability sets to opt into the chat approval round-trip and
   * an MCP `destructiveHint` annotation. See Homi's approval-requested flow.
   */
  readOnly: boolean;
  /**
   * Force the chat approval round-trip (AI SDK `needsApproval`) regardless of
   * `readOnly`. The adapter defaults this to `!readOnly`, so a write capability
   * is gated by an in-chat approval card by default; set explicitly to override.
   */
  needsApproval?: boolean;
  domain: CapabilityDomain;
  execute: (input: z.infer<I>, ctx: CapabilityContext) => Promise<O>;
}

/** Identity helper that pins the generics so each capability keeps its types. */
export function defineCapability<I extends z.ZodTypeAny, O>(
  cap: Capability<I, O>,
): Capability<I, O> {
  return cap;
}

/** A capability with its specifics erased — the shape a registry array holds. */
export type AnyCapability = Capability;
