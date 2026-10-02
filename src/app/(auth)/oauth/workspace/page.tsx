import { redirect } from "next/navigation";

/** Compatibility for old bookmarks; new grants go directly to consent. */
export default async function LegacyOAuthWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const entry of Array.isArray(value) ? value : value ? [value] : []) {
      params.append(key, entry);
    }
  }
  redirect(`/consent?${params}`);
}
