import type { Metadata } from "next";

import { IntakeForm, type IntakeSeed } from "./IntakeForm";

export const metadata: Metadata = {
  title: "Let's get your ads live · Wander",
  robots: { index: false, follow: false },
};

/** Comma-separated query param to a trimmed list. */
function list(value: string | string[] | undefined): string[] | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function one(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || null;
}

/**
 * Performance+ intake, PREVIEW.
 *
 * The real form lives at /intake/[token], prefilled from the brand and wired
 * to submit. This route is the same component with nowhere to send anything:
 * it exists so the flow can be demoed or reviewed without minting a link
 * against a real client. Everything the tokenised route reads from the
 * database is a query param here:
 *
 *   /intake?brand=Winter%20Park%20Escapes&contact=Cynthia&email=…
 *          &site=winterparkescapes.com&properties=The%20Rowhouse,Cedar%20%26%20Ninth
 */
export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const seed: IntakeSeed = {
    brand: one(query.brand) ?? "Winter Park Escapes",
    contact: one(query.contact) ?? "Cynthia",
    email: one(query.email) ?? "cynthia@winterparkescapes.com",
    site: one(query.site) ?? "winterparkescapes.com",
    properties: list(query.properties),
    leadsieUrl: one(query.leadsie) ?? "https://app.leadsie.com/connect/wander",
    repName: one(query.rep) ?? "Brooke",
    repEmail: one(query.repEmail) ?? "brooke@wander.com",
  };

  return <IntakeForm seed={seed} token={null} />;
}
