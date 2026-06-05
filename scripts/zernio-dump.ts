/**
 * zernio-dump.ts — THROWAWAY. Dumps real Zernio payloads so we can see the
 * actual field shapes per platform before committing to a platform_post
 * mapping. Inspect-only; writes nothing.
 *
 *   bun scripts/zernio-dump.ts                 # accounts + profiles + posts per platform
 *   bun scripts/zernio-dump.ts --json          # also dump full raw JSON of one post per platform
 *   bun scripts/zernio-dump.ts --platform x    # only this platform
 *
 * The docs (https://docs.zernio.com/posts/get-post) omit media/analytics
 * fields, so --json is the point: see what really comes back.
 */
import {
  getZernioAnalytics,
  getZernioPost,
  isZernioConfigured,
  listZernioAccounts,
  listZernioPosts,
  listZernioProfiles,
  type ZernioAccount,
} from "@/server/clients/zernio.client";

const argv = process.argv.slice(2);
const DUMP_JSON = argv.includes("--json");
const platformArg = (() => {
  const i = argv.indexOf("--platform");
  return i >= 0 ? argv[i + 1] : undefined;
})();

function fieldKeys(obj: unknown): string[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.keys(obj).sort();
}

function accountLabel(a: ZernioAccount): string {
  const id = a._id ?? a.id ?? "?";
  const handle = a.username ?? a.displayName ?? a.name ?? "?";
  return `${a.platform} · ${handle} (${id})`;
}

async function main() {
  if (!isZernioConfigured) {
    console.error("ZERNIO_API_KEY not configured — aborting.");
    process.exit(1);
  }

  console.log("=== ACCOUNTS (connected social accounts) ===");
  const accounts = await listZernioAccounts();
  for (const a of accounts) console.log("  •", accountLabel(a));
  console.log(`  (${accounts.length} accounts; keys:`, fieldKeys(accounts[0]), ")\n");

  console.log("=== PROFILES (workspace groupings) ===");
  const profiles = await listZernioProfiles({ includeOverLimit: true });
  for (const p of profiles)
    console.log(`  • ${p.name ?? "?"} (${p._id ?? "?"})${p.isDefault ? " [default]" : ""}`);
  console.log(`  (${profiles.length} profiles; keys:`, fieldKeys(profiles[0]), ")\n");

  // Platforms to probe = connected platforms (deduped), or the --platform arg.
  const platforms = platformArg
    ? [platformArg]
    : [...new Set(accounts.map((a) => a.platform).filter(Boolean))];

  for (const platform of platforms) {
    console.log(`\n=== POSTS · platform=${platform} ===`);
    try {
      const { posts, pagination } = await listZernioPosts({
        platform,
        limit: 5,
        sortBy: "created-desc",
      });
      console.log(`  total=${pagination.total} pages=${pagination.pages} (showing ${posts.length})`);

      const first = posts[0];
      if (!first) {
        console.log("  (no posts)");
        continue;
      }

      console.log("  list-item keys:", fieldKeys(first));
      const firstPlatform = first.platforms?.[0];
      console.log("  platforms[0] keys:", fieldKeys(firstPlatform));
      console.log(
        "  platforms[0].accountId:",
        typeof firstPlatform?.accountId === "object"
          ? fieldKeys(firstPlatform.accountId)
          : firstPlatform?.accountId,
      );

      for (const p of posts) {
        const targets = (p.platforms ?? [])
          .map((pl) => `${pl.platform}:${pl.status}`)
          .join(", ");
        console.log(
          `    - ${p._id} [${p.status}] ${(p.title ?? p.content ?? "").slice(0, 50)}… → ${targets}`,
        );
      }

      // Detail fetch — the list view omits media/analytics; the detail may not.
      const detailId = first._id;
      if (detailId) {
        const detail = await getZernioPost(detailId);
        console.log("  detail keys:", fieldKeys(detail));
        if (DUMP_JSON) {
          console.log("  --- RAW DETAIL JSON ---");
          console.log(JSON.stringify(detail, null, 2));
        }
      }
    } catch (e) {
      console.log("  ERROR:", e instanceof Error ? e.message : String(e));
    }
  }

  // ANALYTICS is the REAL content source for Wander: /posts is empty because
  // Wander publishes natively, and Zernio mirrors those as isExternal posts on
  // /analytics. This is what maps onto platform_post (source=scraped/owned).
  // The endpoint caps the range at 1 year.
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1);
  fromDate.setUTCDate(fromDate.getUTCDate() + 1); // stay strictly under 1y
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  for (const platform of platforms) {
    console.log(`\n=== ANALYTICS · platform=${platform} ===`);
    try {
      const { posts } = await getZernioAnalytics({
        platform: platform,
        fromDate: iso(fromDate),
        toDate: iso(toDate),
        source: "all",
      });
      console.log(`  count=${posts.length}`);
      const sample = posts[0];
      if (!sample) {
        console.log("  (no analytics posts)");
        continue;
      }
      console.log("  keys:", fieldKeys(sample));
      console.log("  mediaTypes:", [
        ...new Set(posts.map((p) => p.mediaType).filter(Boolean)),
      ]);
      if (DUMP_JSON) {
        console.log("  --- RAW ANALYTICS POST JSON ---");
        console.log(JSON.stringify(sample, null, 2));
      }
    } catch (e) {
      console.log("  ERROR:", e instanceof Error ? e.message : String(e));
    }
  }

  console.log("\nDone.");
}

void main();
