/**
 * Tracked links for social-listening engagement.
 *
 * When we drop a wander.com link into a Reddit / X / forum reply, we want the
 * signups & bookings it drives to show up in Amplitude attributed to that exact
 * conversation — not lumped into "direct". wander.com already does the hard
 * part: @wandercom/tracking-web captures UTMs on landing and carries them onto
 * every Amplitude event (first/last-touch), so all we do here is *tag the link*.
 *
 * The trick: `utm_content = the mention id`. That's a stable join key — a
 * conversion's `last_utm_content` in Amplitude points straight back at the row
 * in the `mention` table that earned it, with no matching heuristics.
 *
 * Mirrors the cold-email convention formerly used by the retired lead sender (which uses
 * utm_medium=outbound, utm_content=<domain>); organic engagement is
 * utm_medium=community so the two channels stay separable in Amplitude.
 *
 * Pure + client-safe (no server-only imports): client cards build the link on
 * render — zero round-trip, zero storage — and the Slack broadcaster builds the
 * identical link server-side.
 */

export const WANDER_COM = "https://www.wander.com";

/** Preset destinations. Keep paths in sync with real wander.com routes. */
export const TRACKED_LINK_DESTINATIONS = [
  { id: "os", label: "WanderOS audit", path: "/os" },
  { id: "home", label: "Home", path: "/" },
  { id: "list", label: "List with us", path: "/list" },
] as const;

export type TrackedLinkDestinationId =
  (typeof TRACKED_LINK_DESTINATIONS)[number]["id"];

/** Operator audience first — Reddit/X listening skews toward STR operators. */
export const DEFAULT_TRACKED_DESTINATION: TrackedLinkDestinationId = "os";

export type TrackedLinkInput = {
  /** mention.id → utm_content, the join key back to the row. */
  id: string;
  /** mention.source → utm_source (reddit, twitter, instagram, …). */
  source: string;
  /** mention.subreddit → utm_term, so Amplitude can facet by sub. */
  subreddit?: string | null;
};

/**
 * Build a UTM-tagged wander.com link for a mention. `destination` is a preset
 * id (see TRACKED_LINK_DESTINATIONS) or a raw wander.com path / full URL for
 * the "custom" case. Existing query params on a custom URL are never clobbered.
 */
export function buildTrackedLink(
  mention: TrackedLinkInput,
  // Preset id (keeps autocomplete) or any raw path / URL for the custom case.
  destination:
    | TrackedLinkDestinationId
    | (string & {}) = DEFAULT_TRACKED_DESTINATION,
): string {
  const preset = TRACKED_LINK_DESTINATIONS.find((d) => d.id === destination);
  const base = preset
    ? `${WANDER_COM}${preset.path}`
    : resolveCustomBase(destination);

  const url = new URL(base);
  const set = (key: string, value?: string | null) => {
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  };
  set("utm_source", mention.source);
  set("utm_medium", "community");
  set("utm_campaign", "social_listening");
  set("utm_content", mention.id);
  set("utm_term", mention.subreddit ?? undefined);
  return url.toString();
}

/** A custom destination — accept a full URL or a bare wander.com path. */
function resolveCustomBase(input: string): string {
  const trimmed = input.trim() || "/";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${WANDER_COM}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}
