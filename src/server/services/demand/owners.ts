/**
 * HubSpot owner lookup by email, cached per process.
 *
 * The static roster covers the demand BDR pool, but a lead can legitimately
 * belong to someone outside it (a manual reassignment in Outreach, a rep who
 * joined after the snapshot). Their `demand__bdr` picker value comes from
 * here rather than being left stale or blank.
 */
import { listOwners } from "@/server/clients/hubspot.client";

const TTL_MS = 10 * 60 * 1000;

let cache: { fetchedAt: number; byEmail: Map<string, string> } | null = null;

export async function resolveHubspotOwnerIdByEmail(
  email: string | null | undefined,
): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  if (!cache || Date.now() - cache.fetchedAt > TTL_MS) {
    const owners = await listOwners();
    cache = {
      fetchedAt: Date.now(),
      byEmail: new Map(
        owners
          .filter((owner) => owner.email && !owner.archived)
          .map((owner) => [owner.email!.toLowerCase(), owner.id]),
      ),
    };
  }
  return cache.byEmail.get(normalized) ?? null;
}

export function resetOwnerCache(): void {
  cache = null;
}
