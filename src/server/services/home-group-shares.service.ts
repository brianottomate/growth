import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  notInArray,
  isNull,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import {
  type PublicHomeGroup,
  homeGroupShareRevisionInput,
  safeHomeGroupShareUrl,
  saveHomeGroupShareInput,
  shareExistingHomeGroupInput,
} from "@/lib/home-group-shares";
import { db, withTransaction, type TransactionClient } from "@/server/db";
import {
  brandTable,
  homeTable,
  homeGroupTable,
  homeGroupMemberTable,
  homeGroupShareTable,
} from "@/server/db/schema";

type Actor = { orgId: string; userId: string };
type RevisionInput = z.infer<typeof homeGroupShareRevisionInput>;
type SharedGroup = {
  id: string;
  title: string;
  revision: number;
  brandId: string | null;
  shareToken: string | null;
  homeIds: string[];
};
const fields = {
  id: homeGroupTable.id,
  title: homeGroupShareTable.title,
  revision: homeGroupTable.revision,
  brandId: homeGroupTable.brandId,
  shareToken: homeGroupShareTable.shareToken,
};
const eligible = (orgId: string) =>
  and(
    eq(brandTable.organizationId, orgId),
    eq(brandTable.relationship, "client"),
    isNull(brandTable.deletedAt),
    isNull(homeTable.deletedAt),
  );
const owned = (orgId: string) =>
  sql`(${homeGroupTable.organizationId} = ${orgId} or exists (select 1 from brand owner where owner.id = ${homeGroupTable.brandId} and owner.organization_id = ${orgId} and owner.relationship = 'client' and owner.deleted_at is null))`;

// Driver errors can contain bearer tokens in SQL parameters.
async function privateQuery<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not load or update home group shares. Please try again.",
    });
  }
}
function changedElsewhere(): never {
  throw new ORPCError("CONFLICT", {
    message:
      "This group changed or is no longer available. Reload before trying again; your draft has been kept.",
  });
}
export async function listHomeGroupShareHomes(orgId: string) {
  return privateQuery(() =>
    db
      .select({
        id: homeTable.id,
        brandId: brandTable.id,
        brandName: brandTable.name,
        name: homeTable.name,
        city: homeTable.city,
        state: homeTable.state,
        country: homeTable.country,
        heroSourceUrl: homeTable.heroSourceUrl,
        url: homeTable.url,
      })
      .from(homeTable)
      .innerJoin(brandTable, eq(homeTable.brandId, brandTable.id))
      .where(eligible(orgId))
      .orderBy(asc(brandTable.name), asc(homeTable.name), asc(homeTable.id)),
  );
}
export async function listHomeGroupShareClients(orgId: string) {
  return privateQuery(() =>
    db
      .select({
        id: brandTable.id,
        name: brandTable.name,
        markets: brandTable.markets,
      })
      .from(brandTable)
      .where(
        and(
          eq(brandTable.organizationId, orgId),
          eq(brandTable.relationship, "client"),
          isNull(brandTable.deletedAt),
        ),
      )
      .orderBy(asc(brandTable.name)),
  );
}
export async function listShareableHomeGroups(orgId: string) {
  return privateQuery(() =>
    db
      .select({
        id: homeGroupTable.id,
        name: homeGroupTable.name,
        brandId: homeGroupTable.brandId,
        revision: homeGroupTable.revision,
        isPrimary: homeGroupTable.isPrimary,
        homeIds: sql<
          string[]
        >`coalesce((select jsonb_agg(m.home_id order by m.sort_order, m.home_id) from home_group_member m where m.group_id = ${homeGroupTable.id}), '[]'::jsonb)`,
        shared: sql<boolean>`${homeGroupShareTable.groupId} is not null`,
      })
      .from(homeGroupTable)
      .leftJoin(
        homeGroupShareTable,
        eq(homeGroupShareTable.groupId, homeGroupTable.id),
      )
      .where(owned(orgId))
      .orderBy(asc(homeGroupTable.name)),
  );
}
async function readGroups(
  client: typeof db | TransactionClient,
  orgId: string,
  id?: string,
): Promise<SharedGroup[]> {
  const homes = client
    .select({ id: homeTable.id, brandId: homeTable.brandId })
    .from(homeTable)
    .innerJoin(brandTable, eq(homeTable.brandId, brandTable.id))
    .where(eligible(orgId))
    .as("eligible_shared_homes");
  const rows = await client
    .select({
      ...fields,
      homeId: homes.id,
    })
    .from(homeGroupTable)
    .innerJoin(
      homeGroupShareTable,
      eq(homeGroupShareTable.groupId, homeGroupTable.id),
    )
    .leftJoin(
      homeGroupMemberTable,
      eq(homeGroupMemberTable.groupId, homeGroupTable.id),
    )
    .leftJoin(
      homes,
      and(
        eq(homes.id, homeGroupMemberTable.homeId),
        sql`(${homeGroupTable.brandId} is null or ${homes.brandId} = ${homeGroupTable.brandId})`,
      ),
    )
    .where(
      and(
        owned(orgId),
        eq(homeGroupShareTable.organizationId, orgId),
        id ? eq(homeGroupTable.id, id) : undefined,
      ),
    )
    .orderBy(
      desc(homeGroupShareTable.updatedAt),
      asc(homeGroupTable.id),
      asc(homeGroupMemberTable.sortOrder),
      asc(homeGroupMemberTable.homeId),
    );
  const groups = new Map<string, SharedGroup>();
  for (const { homeId, ...group } of rows) {
    let result = groups.get(group.id);
    if (!result) {
      result = { ...group, homeIds: [] };
      groups.set(group.id, result);
    }
    if (homeId) {
      result.homeIds.push(homeId);
    }
  }
  return [...groups.values()];
}
export async function listHomeGroupShares(orgId: string) {
  return privateQuery(() => readGroups(db, orgId));
}
async function lockGroup(
  tx: TransactionClient,
  input: RevisionInput,
  actor: Actor,
  checkRevision = true,
) {
  const [group] = await tx
    .select()
    .from(homeGroupTable)
    .where(
      and(
        eq(homeGroupTable.id, input.id),
        owned(actor.orgId),
        checkRevision
          ? eq(homeGroupTable.revision, input.expectedRevision)
          : undefined,
      ),
    )
    .for("update");
  if (!group) changedElsewhere();
  // Keep a brand owner's workspace/relationship stable through the write.
  if (group.brandId) {
    const [brand] = await tx
      .select({ id: brandTable.id })
      .from(brandTable)
      .where(
        and(
          eq(brandTable.id, group.brandId),
          eq(brandTable.organizationId, actor.orgId),
          eq(brandTable.relationship, "client"),
          isNull(brandTable.deletedAt),
        ),
      )
      .for("share");
    if (!brand) changedElsewhere();
  }
  return group;
}
async function validateHomes(
  tx: TransactionClient,
  homeIds: string[],
  actor: Actor,
  brandId: string | null,
) {
  const homes = await tx
    .select({ id: homeTable.id })
    .from(homeTable)
    .innerJoin(brandTable, eq(homeTable.brandId, brandTable.id))
    .where(
      and(
        eligible(actor.orgId),
        inArray(homeTable.id, homeIds),
        brandId ? eq(homeTable.brandId, brandId) : undefined,
      ),
    )
    .orderBy(asc(homeTable.id))
    .for("share");
  if (homes.length !== homeIds.length)
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Some selected homes are no longer available in this group’s workspace. Reload the catalog and review your selection.",
    });
}
async function readSaved(tx: TransactionClient, actor: Actor, id: string) {
  const [group] = await readGroups(tx, actor.orgId, id);
  if (!group) changedElsewhere();
  return group;
}
export async function saveHomeGroupShare(
  input: z.input<typeof saveHomeGroupShareInput>,
  actor: Actor,
) {
  const parsed = saveHomeGroupShareInput.safeParse(input);
  if (!parsed.success)
    throw new ORPCError("BAD_REQUEST", {
      message: "Enter a title (1–120 characters) and 1–1000 unique homes. ",
    });
  const values = parsed.data;
  return privateQuery(() =>
    withTransaction(async (tx) => {
      const group = values.id
        ? await lockGroup(
            tx,
            { id: values.id, expectedRevision: values.expectedRevision! },
            actor,
            false,
          )
        : null;
      await validateHomes(tx, values.homeIds, actor, group?.brandId ?? null);
      let id: string;
      if (group) {
        const [share] = await tx
          .select({
            id: homeGroupShareTable.groupId,
            shareToken: homeGroupShareTable.shareToken,
          })
          .from(homeGroupShareTable)
          .where(
            and(
              eq(homeGroupShareTable.groupId, group.id),
              eq(homeGroupShareTable.organizationId, actor.orgId),
            ),
          );
        if (!share) changedElsewhere();
        // Brand groups also drive ads and booking targets. Change membership in their existing editor.
        if (group.brandId) {
          const members = await tx
            .select({ homeId: homeGroupMemberTable.homeId })
            .from(homeGroupMemberTable)
            .where(eq(homeGroupMemberTable.groupId, group.id))
            .orderBy(
              asc(homeGroupMemberTable.sortOrder),
              asc(homeGroupMemberTable.homeId),
            );
          if (
            JSON.stringify(members.map((m) => m.homeId)) !==
            JSON.stringify(values.homeIds)
          )
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Edit this brand group’s homes in its client workspace. You can change its public title here.",
            });
        }
        id = group.id;
        await tx
          .update(homeGroupTable)
          .set({
            ...(group.brandId ? {} : { name: values.title }),
            revision: sql`${homeGroupTable.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(homeGroupTable.id, id));
        await tx
          .update(homeGroupShareTable)
          .set({
            title: values.title,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(homeGroupShareTable.groupId, id),
              eq(homeGroupShareTable.organizationId, actor.orgId),
            ),
          );
        if (!group.brandId)
          await tx
            .delete(homeGroupMemberTable)
            .where(
              and(
                eq(homeGroupMemberTable.groupId, id),
                notInArray(homeGroupMemberTable.homeId, values.homeIds),
              ),
            );
      } else {
        const [created] = await tx
          .insert(homeGroupTable)
          .values({
            organizationId: actor.orgId,
            name: values.title,
            source: "custom",
          })
          .returning({ id: homeGroupTable.id });
        if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
        id = created.id;
        await tx.insert(homeGroupShareTable).values({
          groupId: id,
          organizationId: actor.orgId,
          title: values.title,
          createdBy: actor.userId,
          shareToken: randomBytes(32).toString("base64url"),
        });
      }
      if (!group?.brandId)
        await tx
          .insert(homeGroupMemberTable)
          .values(
            values.homeIds.map((homeId, sortOrder) => ({
              groupId: id,
              homeId,
              sortOrder,
            })),
          )
          .onConflictDoUpdate({
            target: [homeGroupMemberTable.groupId, homeGroupMemberTable.homeId],
            set: { sortOrder: sql`excluded.sort_order` },
          });
      return readSaved(tx, actor, id);
    }),
  );
}
export async function deleteHomeGroupShare(input: RevisionInput, actor: Actor) {
  return privateQuery(() =>
    withTransaction(async (tx) => {
      const group = await lockGroup(
        tx,
        homeGroupShareRevisionInput.parse(input),
        actor,
      );
      const [share] = await tx
        .delete(homeGroupShareTable)
        .where(
          and(
            eq(homeGroupShareTable.groupId, group.id),
            eq(homeGroupShareTable.organizationId, actor.orgId),
          ),
        )
        .returning({ id: homeGroupShareTable.groupId });
      if (!share) throw new ORPCError("NOT_FOUND");
      // An existing client group still owns ads/catalog selections. Remove only
      // its sharing settings; a dedicated workspace collection owns its group.
      if (!group.brandId)
        await tx
          .delete(homeGroupTable)
          .where(
            and(
              eq(homeGroupTable.id, group.id),
              eq(homeGroupTable.organizationId, actor.orgId),
            ),
          );
      return { id: group.id };
    }),
  );
}

export async function shareExistingHomeGroup(
  input: z.input<typeof shareExistingHomeGroupInput>,
  actor: Actor,
) {
  const values = shareExistingHomeGroupInput.parse(input);
  return privateQuery(() =>
    withTransaction(async (tx) => {
      const group = await lockGroup(tx, values, actor);
      const members = await tx
        .select({ homeId: homeGroupMemberTable.homeId })
        .from(homeGroupMemberTable)
        .where(eq(homeGroupMemberTable.groupId, group.id));
      if (!members.length || members.length > 1000)
        throw new ORPCError("BAD_REQUEST", {
          message: "Choose a group with 1–1000 homes before sharing.",
        });
      await validateHomes(
        tx,
        members.map((m) => m.homeId),
        actor,
        group.brandId,
      );
      const [existing] = await tx
        .select({ id: homeGroupShareTable.groupId })
        .from(homeGroupShareTable)
        .where(eq(homeGroupShareTable.groupId, group.id));
      if (existing)
        throw new ORPCError("CONFLICT", {
          message:
            "This group already has sharing settings. Use its existing share controls.",
        });
      await tx.insert(homeGroupShareTable).values({
        groupId: group.id,
        organizationId: actor.orgId,
        title: values.title,
        createdBy: actor.userId,
        shareToken: randomBytes(32).toString("base64url"),
      });
      await tx
        .update(homeGroupTable)
        .set({
          revision: sql`${homeGroupTable.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(homeGroupTable.id, group.id));
      return readSaved(tx, actor, group.id);
    }),
  );
}
async function changeLink(input: RevisionInput, actor: Actor, renew: boolean) {
  const parsed = homeGroupShareRevisionInput.safeParse(input);
  if (!parsed.success)
    throw new ORPCError("BAD_REQUEST", {
      message: "A group and its current revision are required.",
    });
  return privateQuery(() =>
    withTransaction(async (tx) => {
      const group = await lockGroup(tx, parsed.data, actor);
      const [share] = await tx
        .update(homeGroupShareTable)
        .set({
          shareToken: renew ? randomBytes(32).toString("base64url") : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(homeGroupShareTable.groupId, group.id),
            eq(homeGroupShareTable.organizationId, actor.orgId),
          ),
        )
        .returning({ id: homeGroupShareTable.groupId });
      if (!share) changedElsewhere();
      await tx
        .update(homeGroupTable)
        .set({
          revision: sql`${homeGroupTable.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(homeGroupTable.id, group.id));
      return readSaved(tx, actor, group.id);
    }),
  );
}
export async function revokeHomeGroupShare(input: RevisionInput, actor: Actor) {
  return changeLink(input, actor, false);
}
export async function renewHomeGroupShareLink(
  input: RevisionInput,
  actor: Actor,
) {
  return changeLink(input, actor, true);
}
function publicHomeKey(token: string, homeId: string) {
  return createHmac("sha256", token).update(homeId).digest("base64url");
}
export async function getPublicHomeGroupShare(
  token: string,
  client: typeof db | TransactionClient = db,
): Promise<PublicHomeGroup | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return privateQuery(async () => {
    const homes = client
      .select({
        id: homeTable.id,
        brandId: homeTable.brandId,
        organizationId: brandTable.organizationId,
        name: homeTable.name,
        photoUrl: homeTable.heroSourceUrl,
        city: homeTable.city,
        state: homeTable.state,
        country: homeTable.country,
        url: homeTable.url,
      })
      .from(homeTable)
      .innerJoin(brandTable, eq(homeTable.brandId, brandTable.id))
      .where(
        and(
          eq(brandTable.relationship, "client"),
          isNull(brandTable.deletedAt),
          isNull(homeTable.deletedAt),
        ),
      )
      .as("public_shared_homes");
    // One snapshot checks the token, current owner, and home eligibility.
    const rows = await client
      .select({
        title: homeGroupShareTable.title,
        homeId: homes.id,
        name: homes.name,
        photoUrl: homes.photoUrl,
        city: homes.city,
        state: homes.state,
        country: homes.country,
        url: homes.url,
      })
      .from(homeGroupShareTable)
      .innerJoin(
        homeGroupTable,
        eq(homeGroupTable.id, homeGroupShareTable.groupId),
      )
      .leftJoin(
        homeGroupMemberTable,
        eq(homeGroupMemberTable.groupId, homeGroupTable.id),
      )
      .leftJoin(
        homes,
        and(
          eq(homes.id, homeGroupMemberTable.homeId),
          sql`((${homeGroupTable.brandId} is null and ${homes.organizationId} = ${homeGroupTable.organizationId}) or ${homes.brandId} = ${homeGroupTable.brandId})`,
        ),
      )
      .where(
        and(
          eq(homeGroupShareTable.shareToken, token),
          sql`(${homeGroupTable.brandId} is not null or ${homeGroupTable.organizationId} = ${homeGroupShareTable.organizationId})`,
          sql`(${homeGroupTable.brandId} is null or exists (select 1 from brand owner where owner.id = ${homeGroupTable.brandId} and owner.organization_id = ${homeGroupShareTable.organizationId} and owner.relationship = 'client' and owner.deleted_at is null))`,
        ),
      )
      .orderBy(
        asc(homeGroupMemberTable.sortOrder),
        asc(homeGroupMemberTable.homeId),
      );
    if (!rows[0]) return null;
    return {
      title: rows[0].title,
      homes: rows.flatMap((home) =>
        home.name === null || home.homeId === null
          ? []
          : [
              {
                key: publicHomeKey(token, home.homeId),
                name: home.name,
                photoUrl: safeHomeGroupShareUrl(home.photoUrl),
                location:
                  [home.city, home.state, home.country]
                    .map((part) => part?.trim())
                    .filter(Boolean)
                    .join(", ") || null,
                url: safeHomeGroupShareUrl(home.url),
              },
            ],
      ),
    };
  });
}
