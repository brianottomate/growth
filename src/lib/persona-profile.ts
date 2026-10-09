import { z } from "zod";

export const PERSONA_ICONS = {
  users: "Group",
  heart: "Connection",
  briefcase: "Work",
  compass: "Discovery",
  sun: "Leisure",
  home: "Home",
  laptop: "Remote work",
  landmark: "Culture",
} as const;
export type PersonaIcon = keyof typeof PERSONA_ICONS;
const icon = z.enum(
  Object.keys(PERSONA_ICONS) as [PersonaIcon, ...PersonaIcon[]],
);
export const personaProfileSchema = z.strictObject({
  icon,
  motivation: z.string().trim().min(1).max(500),
  // Preserve accepted detail when merging older profiles; regeneration condenses it.
  pills: z.array(z.string().trim().min(1).max(160)).max(24),
});
export type PersonaProfile = z.infer<typeof personaProfileSchema>;
export const generatedPersonaProfileSchema = personaProfileSchema.extend({
  motivation: z.string().trim().min(1).max(160),
  pills: z.array(z.string().trim().min(1).max(50)).min(2).max(5),
});

// Read compatibility for the deployment of 0024_compact_persona_profiles.
// Remove once the migration is deployed and old writers have been retired.
const legacyPhrases = z.array(z.string().trim().min(1).max(160)).max(8);
const legacyProfileSchema = z.strictObject({
  motivation: z.string().trim().min(1).max(500),
  needs: legacyPhrases,
  decisionCriteria: legacyPhrases,
  objections: legacyPhrases,
  evidenceNote: z.string().trim().min(1).max(600),
});
export function readPersonaProfile(value: unknown): PersonaProfile {
  const compact = personaProfileSchema.safeParse(value);
  if (compact.success) return compact.data;
  const legacy = legacyProfileSchema.parse(value);
  return {
    icon: "users",
    motivation: legacy.motivation,
    pills: [...legacy.needs, ...legacy.decisionCriteria, ...legacy.objections],
  };
}
