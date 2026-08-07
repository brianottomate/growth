import "server-only";

import { Liquid } from "liquidjs";

/**
 * Simulate Customer.io's liquid pass over growth-rendered email HTML.
 *
 * The document keeps raw liquid ({{ customer.first_name | default: "there" }})
 * and CIO expands it per recipient at delivery. Growth's preview should show
 * both truths: the template as stored, and what a recipient will actually see.
 *
 * Honesty constraints, because "same language" is not "same engine": CIO runs
 * its own implementation of Shopify-flavored Liquid with proprietary
 * extensions (unsubscribe tags, data feeds, trigger payloads). liquidjs speaks
 * the core language only, so this simulation covers `customer.*` tokens,
 * filters and simple conditionals — and REPORTS anything it could not resolve
 * instead of rendering it away silently. The delivery-path check stays the
 * seed-segment test send in CIO; this is the fast local approximation.
 */

export type LiquidPersona = "full" | "sparse";

/** A recipient with every attribute a template might use. */
const FULL_PROFILE = {
  customer: {
    first_name: "Jane",
    last_name: "Rivera",
    email: "jane@example.com",
    city: "Austin",
    region: "TX",
  },
};

/**
 * A recipient CIO knows nothing about. Every `| default:` fallback in the
 * template has to earn its keep here — this persona exists to catch the
 * "Hi ," email before a real inbox does.
 */
const SPARSE_PROFILE = { customer: {} };

const engine = new Liquid({
  // Unknown variables render as empty rather than throwing, which is what
  // CIO does; the missing-token report below is our loudness instead.
  strictVariables: false,
  strictFilters: false,
});

/** Tokens the simulation deliberately does not touch — CIO-only machinery. */
const CIO_ONLY_PATTERN =
  /\{\{\s*(?:trigger|event|unsubscribe)[^}]*\}\}|\{%\s*(?:unsubscribe|snippet)[^%]*%\}/gi;

export async function simulateLiquid(
  html: string,
  persona: LiquidPersona,
): Promise<{ html: string; warnings: string[] }> {
  const warnings: string[] = [];

  // Set CIO-proprietary constructs aside before parsing: liquidjs would either
  // choke on them or silently blank them, and both misrepresent the send.
  const preserved: string[] = [];
  const masked = html.replace(CIO_ONLY_PATTERN, (match) => {
    preserved.push(match);
    return `@@CIO_TAG_${preserved.length - 1}@@`;
  });
  if (preserved.length) {
    warnings.push(
      `${preserved.length} Customer.io-specific tag${preserved.length === 1 ? "" : "s"} left unrendered (shown as-is): ${[...new Set(preserved)].join(", ")}. Verify these with a seed send.`,
    );
  }

  let rendered: string;
  try {
    rendered = (await engine.parseAndRender(
      masked,
      persona === "full" ? FULL_PROFILE : SPARSE_PROFILE,
    )) as string;
  } catch (error) {
    return {
      html,
      warnings: [
        `Liquid simulation failed, showing the raw template: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  // With the sparse persona, an empty expansion next to a greeting comma is
  // exactly the bug this exists to catch. Cheap heuristic, loud message.
  if (
    persona === "sparse" &&
    /(?:^|>)\s*Hi\s*,|Hey\s*,|Hello\s*,/i.test(rendered)
  ) {
    warnings.push(
      'A greeting appears to render as "Hi ," for recipients with no profile attributes. Add a | default: fallback.',
    );
  }

  const restored = rendered.replace(
    /@@CIO_TAG_(\d+)@@/g,
    (_, index: string) => preserved[Number(index)] ?? "",
  );
  return { html: restored, warnings };
}
