import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  emptyLaunchBrief,
  launchDeliverableSchema,
  launchTierGuidance,
  type LaunchBrief,
  type LaunchDeliverable,
  type LaunchSurface,
  type LaunchTier,
} from "@/lib/launch";
import { db } from "@/server/db";
import {
  campaignTable,
  contentPostTable,
  emailDocumentTable,
  launchTable,
  productionPacketTable,
  productTable,
  seriesTable,
  userTable,
} from "@/server/db/schema";

/**
 * One fat read per launch, one thin write per verb. The read resolves the
 * deliverable refs and says what is still missing, so neither the UI nor the
 * assistant has to hold the state machine in its head.
 */

export function slugifyLaunch(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Tier decides which surfaces a launch is expected to cover. */
export function defaultDeliverables(tier: LaunchTier): LaunchDeliverable[] {
  return launchTierGuidance[tier].surfaces.map((surface) => ({
    surface,
    status: "not_started" as const,
  }));
}

export async function listLaunches(orgId: string) {
  const rows = await db
    .select({
      id: launchTable.id,
      name: launchTable.name,
      slug: launchTable.slug,
      tier: launchTable.tier,
      status: launchTable.status,
      maturity: launchTable.maturity,
      targetDate: launchTable.targetDate,
      releaseTheme: launchTable.releaseTheme,
      deliverables: launchTable.deliverables,
      productName: productTable.name,
      ownerName: userTable.name,
    })
    .from(launchTable)
    .leftJoin(productTable, eq(launchTable.productId, productTable.id))
    .leftJoin(userTable, eq(launchTable.marketingOwnerId, userTable.id))
    .where(
      and(eq(launchTable.organizationId, orgId), isNull(launchTable.deletedAt)),
    )
    .orderBy(desc(launchTable.targetDate), desc(launchTable.createdAt));

  return rows.map((row) => ({
    ...row,
    ready: row.deliverables.filter(
      (d) => d.status === "ready" || d.status === "shipped",
    ).length,
    total: row.deliverables.length,
  }));
}

type ResolvedRef = {
  kind: LaunchDeliverable["ref"] extends infer R
    ? R extends { kind: infer K }
      ? K
      : never
    : never;
  id: string;
  label: string | null;
  href: string | null;
  missing: boolean;
};

/** Resolve one deliverable ref to a title + in-app link, or mark it missing. */
async function resolveRef(
  ref: NonNullable<LaunchDeliverable["ref"]>,
): Promise<ResolvedRef> {
  const base = { kind: ref.kind, id: ref.id, missing: false } as ResolvedRef;

  if (ref.kind === "url") {
    return { ...base, label: ref.label ?? ref.id, href: ref.id };
  }
  if (ref.kind === "content_post") {
    const row = await db.query.contentPostTable.findFirst({
      where: eq(contentPostTable.id, ref.id),
      columns: { id: true, title: true },
    });
    return row
      ? { ...base, label: row.title ?? "Untitled idea", href: `/app/content?post=${row.id}` }
      : { ...base, label: ref.label ?? null, href: null, missing: true };
  }
  if (ref.kind === "email_document") {
    const row = await db.query.emailDocumentTable.findFirst({
      where: eq(emailDocumentTable.id, ref.id),
      columns: { id: true, subject: true },
    });
    return row
      ? { ...base, label: row.subject || "Untitled email", href: `/app/newsletters` }
      : { ...base, label: ref.label ?? null, href: null, missing: true };
  }
  if (ref.kind === "production_packet") {
    const row = await db.query.productionPacketTable.findFirst({
      where: eq(productionPacketTable.id, ref.id),
      columns: { id: true, title: true },
    });
    return row
      ? { ...base, label: row.title, href: `/app/studio` }
      : { ...base, label: ref.label ?? null, href: null, missing: true };
  }
  return { ...base, label: ref.label ?? null, href: null, missing: true };
}

export async function readLaunch(orgId: string, launchId: string) {
  const launch = await db.query.launchTable.findFirst({
    where: and(
      eq(launchTable.id, launchId),
      eq(launchTable.organizationId, orgId),
      isNull(launchTable.deletedAt),
    ),
    with: { product: true, marketingOwner: true },
  });
  if (!launch) return null;

  const deliverables = await Promise.all(
    launch.deliverables.map(async (d) => ({
      ...d,
      resolved: d.ref ? await resolveRef(d.ref) : null,
    })),
  );

  // Children point at the launch, so plural falls out of the query.
  const [series, campaigns, posts] = await Promise.all([
    db.query.seriesTable.findMany({
      where: eq(seriesTable.launchId, launchId),
      columns: { id: true, name: true, brandId: true, status: true },
    }),
    db.query.campaignTable.findMany({
      where: eq(campaignTable.launchId, launchId),
      columns: { id: true, name: true, status: true, brandId: true },
    }),
    db.query.contentPostTable.findMany({
      where: eq(contentPostTable.launchId, launchId),
      columns: { id: true, title: true, status: true },
    }),
  ]);

  const missing = nextMoves(launch.brief, deliverables);

  // The features this product could ship, so the picker never has to load the
  // atlas separately and a stale story id is visible rather than silent.
  const atlas = launch.product?.atlas;
  const features = (atlas?.stories ?? []).map((story) => ({
    id: story.id,
    name: story.name,
    job: atlas?.jobs.find((job) => job.id === story.jobId)?.name ?? null,
    shipping: (launch.brief.atlas?.storyIds ?? []).includes(story.id),
  }));
  const unknownStoryIds = (launch.brief.atlas?.storyIds ?? []).filter(
    (id) => !features.some((f) => f.id === id),
  );

  return {
    launch,
    deliverables,
    series,
    campaigns,
    posts,
    missing,
    features,
    unknownStoryIds,
  };
}

/**
 * What the launch still needs, in the order a marketing owner would do it.
 * Returned by the read so a caller never has to re-derive it.
 */
export function nextMoves(
  brief: LaunchBrief,
  deliverables: LaunchDeliverable[],
): string[] {
  const moves: string[] = [];
  if (!brief.oneLine) moves.push("Write the one line (140 characters, benefit first).");
  if (!brief.changelogEntry)
    moves.push("Write the changelog entry. If it is hard to write, the scope is wrong.");
  if (brief.claims.length === 0) moves.push("Add up to three provable claims.");
  const unowned = deliverables.filter((d) => !d.ownerName && !d.ownerId);
  if (unowned.length > 0)
    moves.push(
      `Name an owner for ${unowned.map((d) => d.surface).join(", ")}.`,
    );
  const undated = deliverables.filter((d) => d.ownerName && !d.readyBy);
  if (undated.length > 0)
    moves.push(`Set a ready-by date for ${undated.map((d) => d.surface).join(", ")}.`);
  return moves;
}

export async function createLaunch(input: {
  orgId: string;
  userId: string;
  productId: string;
  name: string;
  tier: LaunchTier;
  targetDate?: string | null;
  sourceUrl?: string | null;
  brief?: Partial<LaunchBrief>;
}) {
  const [row] = await db
    .insert(launchTable)
    .values({
      organizationId: input.orgId,
      productId: input.productId,
      name: input.name,
      slug: slugifyLaunch(input.name),
      tier: input.tier,
      targetDate: input.targetDate ?? null,
      sourceUrl: input.sourceUrl ?? null,
      brief: { ...emptyLaunchBrief, ...input.brief },
      deliverables: defaultDeliverables(input.tier),
      createdById: input.userId,
    })
    .returning();
  return row!;
}

/**
 * Upsert ONE deliverable by surface, as a single statement.
 *
 * Read-modify-write in JS loses data here: the assistant fans several of these
 * out in ONE step (that is the point of small tools), each call reads the same
 * array, merges its own surface, and the last write drops the others. It cost
 * two owner assignments the first time a launch was filled from a brief.
 *
 * A transaction is not available — the Neon HTTP driver has none — so the
 * merge happens server-side instead. Every reference to `deliverables` below
 * is a correlated reference to the row being updated, which Postgres
 * re-evaluates against the new row version if a concurrent update commits
 * first, so the calls serialize rather than clobber.
 */
export async function setDeliverable(
  orgId: string,
  launchId: string,
  surface: LaunchSurface,
  patch: Partial<Omit<LaunchDeliverable, "surface">>,
) {
  // Validate the patch on its own; merged with an already-valid element it
  // stays valid, and the shape is what reaches the database.
  //
  // Then keep ONLY the keys the caller actually sent. `status` carries a zod
  // default, which survives `.partial()` and would otherwise ride along in
  // every patch — setting a ready-by date would quietly reset the status.
  const parsed = launchDeliverableSchema.partial().parse({ ...patch, surface });
  const clean = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key === "surface" || key in patch),
  );
  const patchJson = JSON.stringify(clean);
  // A surface that does not exist yet is created, and only then does the
  // default status apply.
  const seed = JSON.stringify({ status: "not_started", ...clean });

  const rows = await db
    .update(launchTable)
    .set({
      deliverables: sql`
        (
          select coalesce(
            jsonb_agg(
              case when elem->>'surface' = ${surface}
                   then elem || ${patchJson}::jsonb
                   else elem end
              order by ord
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(${launchTable.deliverables})
            with ordinality as t(elem, ord)
        )
        ||
        case
          when ${launchTable.deliverables} @> jsonb_build_array(
                 jsonb_build_object('surface', ${surface}::text))
          then '[]'::jsonb
          else jsonb_build_array(${seed}::jsonb)
        end
      `,
      updatedAt: new Date(),
    })
    .where(
      and(eq(launchTable.id, launchId), eq(launchTable.organizationId, orgId)),
    )
    .returning();

  const row = rows[0];
  if (!row) throw new Error("Launch not found");
  return row;
}
