/**
 * A two-word codename that ends every new campaign's name, so a campaign
 * can be said out loud and found again ("the pink_otter push").
 */
export function campaignCodenamePrompt(input: { taken: string[] }) {
  return {
    system: `You name advertising campaigns with a memorable two-word codename: an adjective and a noun, lowercase, joined by an underscore. Playful and concrete, easy to say, nothing about travel or the brand.

Examples: smokey_cloud, pink_otter, brave_lantern, quiet_comet, velvet_moose, salty_pretzel.

Answer with the codename only.`,
    prompt: input.taken.length
      ? `Already used, pick something that shares no word with any of these:\n${input.taken.join("\n")}`
      : "Nothing is used yet.",
  };
}
