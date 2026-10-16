/**
 * Rank an ad account's pixels by what Growth can observe. A pixel that fires on
 * the brand's website outweighs one only existing campaigns track. Returns a
 * recommendation only when one pixel leads; ties are left for a person.
 */
export function rankMetaPixels(input: {
  pixels: { id: string; name: string }[];
  sitePixelIds: string[] | null;
  campaignPixelIds: string[];
}) {
  const options = input.pixels.map((pixel) => {
    const evidence: string[] = [];
    let score = 0;
    if (input.sitePixelIds?.includes(pixel.id)) {
      evidence.push("Fires on the website");
      score += 2;
    }
    const campaigns = input.campaignPixelIds.filter(
      (id) => id === pixel.id,
    ).length;
    if (campaigns) {
      evidence.push(
        `Tracked by ${campaigns} existing campaign${campaigns === 1 ? "" : "s"}`,
      );
      score += 1;
    }
    return { id: pixel.id, name: pixel.name.trim(), evidence, score };
  });
  const top = Math.max(0, ...options.map((o) => o.score));
  const leaders = options.filter((o) => o.score === top);
  const leader = top > 0 && leaders.length === 1 ? leaders[0]! : null;
  return {
    options: options.map(({ id, name, evidence }) => ({ id, name, evidence })),
    recommendedId: leader?.id ?? null,
    why: leader ? leader.evidence.join("; ") : "",
  };
}
