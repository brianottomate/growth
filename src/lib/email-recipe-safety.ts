import {
  newsletterTemplate,
  type DraftFromTemplateInput,
} from "./newsletter-templates";

/** Fail before creating a slot or spending on generation when a recipe lacks facts. */
export function assertRecipeContext(input: DraftFromTemplateInput) {
  const recipe = newsletterTemplate(input.template);
  const missing = recipe.requiredContext.filter(
    (key) =>
      !(key === "offer"
        ? input.offer?.trim()
        : input.verifiedContext?.[key]?.trim()),
  );
  if (missing.length)
    throw new Error(
      `${recipe.label} needs verified context: ${missing.join(", ")}. Supply verifiedContext before drafting.`,
    );
  for (const [key, value] of Object.entries(input.verifiedContext ?? {})) {
    if (key.endsWith("Url")) {
      const url = new URL(value);
      if (url.protocol !== "https:")
        throw new Error(`${key} must be an HTTPS URL.`);
    }
  }
  if (
    recipe.requiredContext.some((key) =>
      ["viewedHome", "savedHome", "checkout", "newHome", "upgrade"].includes(
        key,
      ),
    ) &&
    !input.homeIds?.length
  )
    throw new Error(
      `${recipe.label} needs homeIds identifying the exact home from this brand.`,
    );
}

export function assertNoDemoContent(text: string) {
  if (
    /bluewater\s*haven|bluewaterhaven\.com|hope bay cabin|cedar ridge lodge|driftwood house|121 Central Ave|\[(?:brand|destination|booking site|home [A-D]|host|guest|verified (?:amount|value))\]/i.test(
      text,
    )
  )
    throw new Error(
      "The draft contains demo-brand content. Regenerate using this brand's facts.",
    );
}

/** Reference examples and planning titles cannot establish live operational claims. */
export function unsupportedRecipeClaims(
  text: string,
  context?: Record<string, string>,
) {
  const problems: string[] = [];
  if (
    !context?.event &&
    /lifts?[^.!?\n]{0,60}open(?:s|ing)?[^.!?\n]{0,40}\b\d{1,2}\s*(?:am|pm)\b/i.test(
      text,
    )
  )
    problems.push("Lift opening hours need verified event facts.");
  if (
    !context?.availability &&
    /\b(last chance|selling fast|still open|already (?:gone|booked)|only \d+ (?:homes|nights|weeks) (?:left|available))\b/i.test(
      text,
    )
  )
    problems.push(
      "Scarcity and live availability need verified availability facts.",
    );
  return problems;
}
