import "server-only";

import type { ModelMessage } from "ai";

export type GrowthSurface =
  | "overview-chat"
  | "plan-chat"
  | "mcp"
  | "invoke-growth"
  | "test";

export interface GrowthContextSection {
  id: string;
  content: string;
  cache?: "session" | "none";
}

export interface GrowthContextManifest {
  surface: GrowthSurface;
  characters: number;
  sections: Array<{
    id: string;
    characters: number;
    cache: "session" | "none";
  }>;
}

export class GrowthContextBudgetError extends Error {
  constructor(
    readonly characters: number,
    readonly maximum: number,
  ) {
    super(`Growth context is ${characters} characters; maximum is ${maximum}`);
    this.name = "GrowthContextBudgetError";
  }
}

const sessionCache = {
  anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
} as const;

/** Compose explicit named prompt sections; never silently truncate context. */
export function composeGrowthContext(options: {
  surface: GrowthSurface;
  sections: readonly GrowthContextSection[];
  maximumCharacters?: number;
}): { messages: ModelMessage[]; manifest: GrowthContextManifest } {
  const seen = new Set<string>();
  const sections = options.sections
    .map((section) => ({ ...section, content: section.content.trim() }))
    .filter((section) => section.content.length > 0);

  for (const section of sections) {
    if (!section.id || seen.has(section.id)) {
      throw new Error(
        `Growth context section id must be unique: ${section.id}`,
      );
    }
    seen.add(section.id);
  }

  const characters = sections.reduce(
    (total, section) => total + section.content.length,
    0,
  );
  if (
    options.maximumCharacters !== undefined &&
    characters > options.maximumCharacters
  ) {
    throw new GrowthContextBudgetError(characters, options.maximumCharacters);
  }

  return {
    messages: sections.map((section) => ({
      role: "system" as const,
      content: section.content,
      ...(section.cache === "session" ? { providerOptions: sessionCache } : {}),
    })),
    manifest: {
      surface: options.surface,
      characters,
      sections: sections.map((section) => ({
        id: section.id,
        characters: section.content.length,
        cache: section.cache ?? "none",
      })),
    },
  };
}
