import { redirect } from "next/navigation";

/**
 * /app/plan is retired; the planner is the persistent assistant on /app/next.
 *
 * Callers hand this route more than a brand: the media library's "Launch this"
 * rocket builds a `prompt` (and `name` / `img`) describing the creative, and
 * dropping those on the redirect is why launching an asset used to land the
 * operator on an empty composer. Forward everything and let /app/next decide
 * what it understands.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams({ intent: "plan" });
  for (const [key, value] of Object.entries(params)) {
    if (key === "intent" || value === undefined) continue;
    next.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
  }
  redirect(`/app/next?${next.toString()}`);
}
