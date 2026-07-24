const UNGROUNDED_SUBJECT_GUARDS = [
  {
    pattern:
      /\b(interior|room|bedroom|suite|living room|lounge|kitchen|bathroom|bed|bedding|linen|pillow|duvet|fireplace|sofa|couch|lobby|reception)\b/i,
    guidance:
      "For interior language, suggest the mood through an atmospheric detail such as warm light, textiles, or a tabletop vignette instead of depicting a specific room.",
  },
  {
    pattern:
      /\b(pool|hot tub|jacuzzi|swimming|waterfront|infinity pool|terrace.*pool|pool.*terrace)\b/i,
    guidance:
      "For pool or waterfront language, use abstract water reflections, a towel, or a calm horizon instead of inventing a specific amenity or property.",
  },
  {
    pattern:
      /\b(exterior|facade|villa exterior|home exterior|house exterior|property exterior)\b/i,
    guidance:
      "For exterior language, evoke arrival with a pathway, lantern light, landscaping, or an architectural detail instead of inventing a specific building.",
  },
  {
    pattern:
      /\b(destination|landscape|panorama|golden hour|scenic|attraction|theme park)\b/i,
    guidance:
      "For destination language, favor natural landscapes, neighborhood texture, gardens, or quiet local moments; do not invent a branded landmark or tourist attraction.",
  },
] as const;

export function buildCreativeImagePrompt(input: {
  prompt: string;
  purpose?: string | null;
  instructions?: string | null;
  negativePrompt?: string | null;
  hasReferenceImages: boolean;
}) {
  const sections = [input.prompt.trim()];

  if (input.purpose?.trim()) {
    sections.push(`Creative purpose:\n${input.purpose.trim()}`);
  }
  if (input.instructions?.trim()) {
    sections.push(`Production notes:\n${input.instructions.trim()}`);
  }
  if (input.negativePrompt?.trim()) {
    sections.push(`Avoid:\n${input.negativePrompt.trim()}`);
  }

  sections.push(
    input.hasReferenceImages
      ? [
          "Grounding rules:",
          "Treat the supplied reference images as the source of truth.",
          "Preserve their identity, materials, setting, and important visual details.",
          "Do not invent property features, amenities, logos, people, or product attributes that the references do not support.",
        ].join(" ")
      : [
          "Grounding rules:",
          "Do not present invented people, properties, products, rooms, amenities, or factual attributes as documentary evidence.",
          "When the brief refers to a real offering but provides no visual reference, prefer an atmospheric editorial detail over fabricating a specific real-world subject.",
        ].join(" "),
  );

  if (!input.hasReferenceImages) {
    const contextualGuards = UNGROUNDED_SUBJECT_GUARDS.filter(({ pattern }) =>
      pattern.test(input.prompt),
    ).map(({ guidance }) => guidance);
    if (contextualGuards.length) {
      sections.push(
        `Subject-specific safeguards:\n${contextualGuards.join("\n")}`,
      );
    }
  }

  sections.push(
    "Output rules: Return exactly one finished image. Do not add unintended text, logos, watermarks, borders, contact-sheet framing, or UI chrome.",
  );

  return sections.join("\n\n");
}
