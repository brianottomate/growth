import { z } from "zod";

export const VOICE_AXES = {
  casualFormal: ["Casual", "Conversational", "Balanced", "Polished", "Formal"],
  understatedExpressive: [
    "Understated",
    "Restrained",
    "Balanced",
    "Expressive",
    "Vivid",
  ],
  matterOfFactWarm: [
    "Matter-of-fact",
    "Direct",
    "Balanced",
    "Friendly",
    "Warm",
  ],
} as const;
// Keys are stable identities; labels can change without rewriting saved brands.
export const ARCHETYPES = {
  guide: {
    label: "Guide",
    description: "Helpful, specific, informed",
    instruction:
      "Help people choose with concrete knowledge. Explain useful details and tradeoffs without hype.",
    voice: { casualFormal: 1, understatedExpressive: 1, matterOfFactWarm: 3 },
  },
  caregiver: {
    label: "Caretaker",
    description: "Attentive, reassuring, thoughtful",
    instruction:
      "Reassure through attentive service and clear next steps. Anticipate concerns without making unsupported promises.",
    voice: { casualFormal: 2, understatedExpressive: 1, matterOfFactWarm: 4 },
  },
  explorer: {
    label: "Explorer",
    description: "Curious, discovery-led, adventurous",
    instruction:
      "Invite discovery with specific possibilities and a sense of curiosity. Ground the adventure in what the offering supports.",
    voice: { casualFormal: 1, understatedExpressive: 3, matterOfFactWarm: 3 },
  },
  creator: {
    label: "Curator",
    description: "Considered, discerning, selective",
    instruction:
      "Highlight considered choices and distinctive details. Explain why they matter without implying exclusivity or quality that is not supported.",
    voice: { casualFormal: 3, understatedExpressive: 2, matterOfFactWarm: 2 },
  },
  entertainer: {
    label: "Entertainer",
    description: "Lively, social, enjoyable",
    instruction:
      "Create anticipation for enjoyment and shared experiences. Be lively without forced jokes or exaggerated claims.",
    voice: { casualFormal: 0, understatedExpressive: 4, matterOfFactWarm: 3 },
  },
  expert: {
    label: "Expert",
    description: "Clear, competent, precise",
    instruction:
      "Earn trust with precise explanations and supported evidence. Make complex choices understandable without condescension.",
    voice: { casualFormal: 3, understatedExpressive: 1, matterOfFactWarm: 1 },
  },
  companion: {
    label: "Companion",
    description: "Approachable, familiar, easygoing",
    instruction:
      "Speak as an approachable companion with plain language and practical encouragement. Avoid assumed intimacy or invented shared experiences.",
    voice: { casualFormal: 0, understatedExpressive: 2, matterOfFactWarm: 4 },
  },
} as const;
export type Archetype = keyof typeof ARCHETYPES;
const dial = z.number().int().min(0).max(4);
export const voiceSchema = z.object({
  casualFormal: dial,
  understatedExpressive: dial,
  // Existing two-axis preferences remain valid; warmth comes from the archetype.
  matterOfFactWarm: dial.optional(),
});
export const creativeDirectionSchema = z.object({
  positioning: z.string().trim().min(1).max(300),
  archetype: z
    .enum(Object.keys(ARCHETYPES) as [Archetype, ...Archetype[]])
    .nullable(),
  // Retained for saved briefs; new archetype descriptions belong to the dictionary.
  archetypeReason: z.string().max(300).optional(),
  // Null means use archetype defaults. Existing stored values are explicit overrides.
  voice: voiceSchema.nullable(),
  leadWith: z.array(z.string().trim().min(1).max(100)).max(6),
  neverSay: z.array(z.string().trim().min(1).max(120)).max(12),
});
export type CreativeDirection = z.infer<typeof creativeDirectionSchema>;

export const generatedCreativeDirectionSchema = creativeDirectionSchema
  .omit({ voice: true, archetypeReason: true })
  .extend({
    archetype: z.enum(Object.keys(ARCHETYPES) as [Archetype, ...Archetype[]]),
    positioning: z.string().trim().min(1).max(100),
    leadWith: z.array(z.string().trim().min(1).max(50)).min(2).max(5),
    neverSay: z.array(z.string().trim().min(1).max(70)).min(2).max(5),
  });

export function effectiveVoice(direction: CreativeDirection) {
  const defaults = direction.archetype
    ? ARCHETYPES[direction.archetype].voice
    : { casualFormal: 2, understatedExpressive: 2, matterOfFactWarm: 2 };
  return { ...defaults, ...direction.voice };
}

export function creativeDirectionText(direction?: CreativeDirection | null) {
  if (!direction) return "";
  const resolved = effectiveVoice(direction);
  const voice = (Object.keys(VOICE_AXES) as (keyof typeof VOICE_AXES)[])
    .map((axis) => `${axis}: ${VOICE_AXES[axis][resolved[axis]]}`)
    .join("; ");
  const archetype = direction.archetype
    ? ARCHETYPES[direction.archetype]
    : null;
  return `Creative direction (takes precedence over older voice observations):\nPositioning: ${direction.positioning}\n${archetype ? `Archetype: ${archetype.label}. ${archetype.instruction}\n` : ""}Voice: ${voice}\nLead with: ${direction.leadWith.join("; ")}\nAvoid: ${direction.neverSay.join("; ")}`;
}

export {
  personaProfileSchema,
  generatedPersonaProfileSchema,
  type PersonaProfile,
} from "./persona-profile";
