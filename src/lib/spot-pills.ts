/**
 * Style "pills" for the per-spot AI caption generator — quick steer toggles the
 * card offers next to the free-text nudge. Shared (no server-only deps) so the
 * client card renders the labels and the generate service reads the
 * instructions from the SAME source.
 */
export const SPOT_PILLS = [
  { id: "shorter", label: "Shorter", instruction: "Keep it noticeably shorter and tighter." },
  {
    id: "punchier",
    label: "Punchier",
    instruction: "Make the opening line punchier and scroll-stopping.",
  },
  {
    id: "playful",
    label: "More playful",
    instruction: "Lean more playful and personality-forward.",
  },
  {
    id: "less-salesy",
    label: "Less salesy",
    instruction: "Dial back the sell; lead with the value, not the promotion.",
  },
  {
    id: "add-hashtags",
    label: "Add hashtags",
    instruction: "Include a few relevant, natural hashtags where the platform expects them.",
  },
] as const;

export type SpotPill = (typeof SPOT_PILLS)[number]["id"];

// Tuple form for `z.enum(...)` on the server.
export const SPOT_PILL_IDS = SPOT_PILLS.map((p) => p.id) as [SpotPill, ...SpotPill[]];

export const SPOT_PILL_INSTRUCTION: Record<SpotPill, string> = Object.fromEntries(
  SPOT_PILLS.map((p) => [p.id, p.instruction]),
) as Record<SpotPill, string>;
