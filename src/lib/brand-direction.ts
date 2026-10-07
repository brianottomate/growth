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
} as const;
const dial = z.number().int().min(0).max(4);
export const creativeDirectionSchema = z.object({
  positioning: z.string().trim().min(1).max(300),
  archetype: z
    .enum([
      "guide",
      "caregiver",
      "explorer",
      "creator",
      "entertainer",
      "expert",
      "companion",
    ])
    .nullable(),
  archetypeReason: z.string().max(300),
  voice: z.object({
    casualFormal: dial,
    understatedExpressive: dial,
  }),
  leadWith: z.array(z.string().trim().min(1).max(100)).max(6),
  neverSay: z.array(z.string().trim().min(1).max(120)).max(12),
});
export type CreativeDirection = z.infer<typeof creativeDirectionSchema>;

export const generatedCreativeDirectionSchema = creativeDirectionSchema.extend({
  positioning: z.string().trim().min(1).max(100),
  archetypeReason: z.string().trim().max(120),
  leadWith: z.array(z.string().trim().min(1).max(50)).max(3),
  neverSay: z.array(z.string().trim().min(1).max(70)).max(3),
});

export function creativeDirectionText(direction?: CreativeDirection | null) {
  if (!direction) return "";
  const voice = (Object.keys(VOICE_AXES) as (keyof typeof VOICE_AXES)[])
    .map((axis) => `${axis}: ${VOICE_AXES[axis][direction.voice[axis]]}`)
    .join("; ");
  return `Creative direction (takes precedence over older voice observations):\nPositioning: ${direction.positioning}\nVoice: ${voice}\nLead with: ${direction.leadWith.join("; ")}\nAvoid: ${direction.neverSay.join("; ")}`;
}

const phrases = z.array(z.string().trim().min(1).max(160)).max(8);
export const personaProfileSchema = z.object({
  motivation: z.string().trim().min(1).max(500),
  needs: phrases,
  objections: phrases,
  decisionCriteria: phrases,
  homeIds: z.array(z.string().min(1)).max(100),
  fitReason: z.string().max(500),
  travel: z
    .object({
      purpose: z.string().max(100).nullable(),
      partyMin: z.number().int().min(1).max(100).nullable(),
      partyMax: z.number().int().min(1).max(100).nullable(),
      bookingWindow: z.string().max(100).nullable(),
      stayLength: z.string().max(100).nullable(),
      priceSensitivity: z.enum(["low", "medium", "high"]).nullable(),
      mustHaves: phrases,
    })
    .nullable(),
  evidenceNote: z.string().trim().min(1).max(600),
});
export type PersonaProfile = z.infer<typeof personaProfileSchema>;

export const generatedPersonaProfileSchema = personaProfileSchema.extend({
  motivation: z.string().trim().min(1).max(200),
  needs: z.array(z.string().trim().min(1).max(50)).max(3),
  decisionCriteria: z.array(z.string().trim().min(1).max(50)).max(3),
});
