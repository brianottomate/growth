"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";

import type { GrowthCapabilityId } from "@/lib/growth-capabilities";

export { ThinkingOrb, type OrbState };

/**
 * Which orb a running capability shows.
 *
 * The library ships nine hand-tuned states, so the choice can carry meaning
 * rather than decorate: a read is the scanning globe, a write is particles on
 * orbits, and the capabilities that author something get the composing sash.
 * The point is that a glance at the orb says what kind of work is in flight
 * before the label is read.
 *
 * Typed as capability ids so a renamed capability fails the build here instead
 * of silently falling through to the generic state.
 */
const AUTHORING = [
  "blogAgent",
  "newsletterAgent",
  "renderSocialPosts",
  "prepareProductionPacket",
] as const satisfies readonly GrowthCapabilityId[];

const AUTHORING_SET: ReadonlySet<string> = new Set(AUTHORING);

export function capabilityOrbState(toolName: string): OrbState {
  if (AUTHORING_SET.has(toolName)) return "composing";
  if (toolName.endsWith("Read") || toolName === "workspaceOverview") {
    return "searching";
  }
  return "working";
}
