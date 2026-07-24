function stripQuotedHistory(text: string): string {
  const markers = [
    /^-{2,}\s*original message\s*-{2,}$/im,
    /^on .+wrote:$/im,
    /^from:\s.+$/im,
    /^_{5,}$/m,
    /^begin forwarded message:$/im,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match?.index != null) cut = Math.min(cut, match.index);
  }
  return text.slice(0, cut);
}

/**
 * Keep the personalization that matters (names, companies, claims, questions)
 * while omitting direct contact details and tracking cruft from the model
 * context. HubSpot remains the source of the unmodified activity.
 */
export function cleanCompanyEmailText(
  input: string,
  maxCharacters = 2_400,
): string {
  return stripQuotedHistory(input)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\u00a0", " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(
      /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
      "[phone]",
    )
    .replace(/https?:\/\/[^\s<>"')\]]+/gi, "[link]")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .slice(0, maxCharacters)
    .trim();
}
