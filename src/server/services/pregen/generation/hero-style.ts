import "server-only";

/**
 * Verify the hero line rather than only asking for it.
 *
 * `COPY_VOICE_RULES` already bans em dashes, "not X but Y" and the cliché list, and it is a good
 * prompt. It is still only a prompt. The monolith's hero pass shipped every description within a
 * word of its stated ceiling and two of three reached for the same em-dash-then-restatement
 * shape — the rules were right there and the model wrote past them anyway. Across a batch of
 * forty previews that reads as one template, which is the specific thing a prospect notices when
 * they compare theirs to a competitor's.
 *
 * The hero is the one line worth a second pass: it is the first thing read, it is short enough to
 * check cheaply, and it is where "≤22 words" gets treated as a target instead of a limit.
 */

/** Well under the schema ceiling. A hero that reaches the limit is already too long. */
export const HERO_DESCRIPTION_MAX_WORDS = 16;
export const HERO_TITLE_MAX_WORDS = 7;

const BANNED_SHAPES: Array<{ pattern: RegExp; fault: string }> = [
  { pattern: /[—–]/, fault: "it contains an em dash or en dash" },
  {
    pattern: /\bnot\b\s+(?:a|an|the|just|only|another)\b/i,
    fault: 'it uses an "X, not Y" corrective construction',
  },
  {
    pattern: /\b(?:whether|from)\b[^.]*\bto\b/i,
    fault: 'it uses a "from X to Y" or "whether X or Y" template',
  },
];

export function heroCopyFault(
  value: string,
  maxWords: number,
): string | undefined {
  for (const { pattern, fault } of BANNED_SHAPES) {
    if (pattern.test(value)) {
      return fault;
    }
  }
  const words = value.trim().split(/\s+/).length;
  if (words > maxWords) {
    return `it is ${words} words, over the ${maxWords}-word ceiling`;
  }
  return undefined;
}

/** The faults on a homepage hero, ready to hand back to the model. Empty when it is clean. */
export function heroFaults(hero: {
  title?: string | null;
  description?: string | null;
}): string[] {
  const faults: string[] = [];
  const title = hero.title?.trim();
  const description = hero.description?.trim();
  if (title) {
    const fault = heroCopyFault(title, HERO_TITLE_MAX_WORDS);
    if (fault) {
      faults.push(`The hero title "${title}" is no good: ${fault}.`);
    }
  }
  if (description) {
    const fault = heroCopyFault(description, HERO_DESCRIPTION_MAX_WORDS);
    if (fault) {
      faults.push(`The hero description "${description}" is no good: ${fault}.`);
    }
  }
  return faults;
}
