import { z } from "zod";

export const VOICE_AXES = {
  casualFormal: ["Casual", "Conversational", "Balanced", "Polished", "Formal"],
  playfulSerious: [
    "Playful",
    "Lighthearted",
    "Balanced",
    "Matter-of-fact",
    "Serious",
  ],
  understatedExpressive: [
    "Understated",
    "Restrained",
    "Balanced",
    "Expressive",
    "Vivid",
  ],
  accessibleTechnical: [
    "Everyday language",
    "Accessible",
    "Balanced",
    "Specialist",
    "Technical",
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
    playfulSerious: dial,
    understatedExpressive: dial,
    accessibleTechnical: dial,
  }),
  leadWith: z.array(z.string().trim().min(1).max(100)).max(6),
  neverSay: z.array(z.string().trim().min(1).max(120)).max(12),
});
export type CreativeDirection = z.infer<typeof creativeDirectionSchema>;

export function creativeDirectionText(direction?: CreativeDirection | null) {
  if (!direction) return "";
  const voice = (Object.keys(VOICE_AXES) as (keyof typeof VOICE_AXES)[])
    .map((axis) => `${axis}: ${VOICE_AXES[axis][direction.voice[axis]]}`)
    .join("; ");
  return `Creative direction (takes precedence over older voice observations):\nPositioning: ${direction.positioning}\nVoice: ${voice}\nLead with: ${direction.leadWith.join("; ")}\nAvoid: ${direction.neverSay.join("; ")}`;
}

const phrases = z.array(z.string().trim().min(1).max(160)).max(8);
export const personaProfileSchema = z.object({
  icon: z.enum(["users", "heart", "briefcase", "compass", "home", "sparkles"]),
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
