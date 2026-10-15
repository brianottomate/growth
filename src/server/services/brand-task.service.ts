import "server-only";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, type Database, type TransactionClient } from "@/server/db";
import { brandTable, brandTaskTable } from "@/server/db/schema";
import { DEFAULT_CLIENT_TASKS, type BrandTaskFields } from "@/lib/brand-task";
import { assertOrganizationStaffUser } from "./brand-staffing.service";

type Client = Database | TransactionClient;
type Actor = { orgId: string; userId: string };

async function requireTaskBrand(
  orgId: string,
  brandId: string,
  client: Client,
) {
  const brand = await client.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!brand) throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
}

function taskWhere(brandId: string, id?: string) {
  return and(
    eq(brandTaskTable.brandId, brandId),
    isNull(brandTaskTable.deletedAt),
    id ? eq(brandTaskTable.id, id) : undefined,
  );
}

/** Called by explicit client creation/promotion, never by reads. */
export async function initializeBrandTasks(
  brandId: string,
  createdByUserId: string | null,
  client: Client = db,
) {
  await client
    .insert(brandTaskTable)
    .values(
      DEFAULT_CLIENT_TASKS.map((item, index) => ({
        brandId,
        templateKey: item.key,
        title: item.title,
        category: item.category,
        tags: item.tags,
        sortOrder: index,
        createdByUserId,
      })),
    )
    .onConflictDoNothing({
      target: [brandTaskTable.brandId, brandTaskTable.templateKey],
    });
}

export async function listBrandTasks(
  orgId: string,
  brandId: string,
  client: Client = db,
) {
  await requireTaskBrand(orgId, brandId, client);
  return client.query.brandTaskTable.findMany({
    where: taskWhere(brandId),
    orderBy: [asc(brandTaskTable.sortOrder), asc(brandTaskTable.id)],
    with: {
      creator: { columns: { id: true, name: true, image: true } },
      assignee: { columns: { id: true, name: true, image: true } },
      completedBy: { columns: { id: true, name: true } },
    },
  });
}
export type BrandTaskView = Awaited<ReturnType<typeof listBrandTasks>>[number];

export async function createBrandTask(
  actor: Actor,
  input: { brandId: string } & BrandTaskFields,
  client: Client = db,
) {
  await requireTaskBrand(actor.orgId, input.brandId, client);
  await assertOrganizationStaffUser(actor.orgId, input.assigneeUserId, client);
  const last = await client.query.brandTaskTable.findFirst({
    where: taskWhere(input.brandId),
    orderBy: (t, { desc }) => [desc(t.sortOrder), desc(t.id)],
    columns: { sortOrder: true },
  });
  const [task] = await client
    .insert(brandTaskTable)
    .values({
      ...input,
      createdByUserId: actor.userId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      ...(input.status === "done"
        ? { completedAt: new Date(), completedByUserId: actor.userId }
        : {}),
    })
    .returning();
  return task!;
}

export async function updateBrandTask(
  actor: Actor,
  input: { brandId: string; id: string; patch: Partial<BrandTaskFields> },
  client: Client = db,
) {
  await requireTaskBrand(actor.orgId, input.brandId, client);
  if (input.patch.assigneeUserId !== undefined)
    await assertOrganizationStaffUser(
      actor.orgId,
      input.patch.assigneeUserId,
      client,
    );
  const current = await client.query.brandTaskTable.findFirst({
    where: taskWhere(input.brandId, input.id),
    columns: { status: true },
  });
  if (!current) throw new ORPCError("NOT_FOUND", { message: "Task not found" });
  const statusChanged =
    input.patch.status !== undefined && input.patch.status !== current.status;
  const [task] = await client
    .update(brandTaskTable)
    .set({
      ...input.patch,
      ...(statusChanged
        ? {
            completedAt: input.patch.status === "done" ? new Date() : null,
            completedByUserId:
              input.patch.status === "done" ? actor.userId : null,
          }
        : {}),
    })
    .where(taskWhere(input.brandId, input.id))
    .returning();
  if (!task) throw new ORPCError("NOT_FOUND", { message: "Task not found" });
  return task;
}

export async function removeBrandTask(
  actor: Actor,
  input: { brandId: string; id: string },
  client: Client = db,
) {
  await requireTaskBrand(actor.orgId, input.brandId, client);
  const [task] = await client
    .update(brandTaskTable)
    .set({ deletedAt: new Date() })
    .where(taskWhere(input.brandId, input.id))
    .returning();
  if (!task) throw new ORPCError("NOT_FOUND", { message: "Task not found" });
  return { id: task.id };
}

export async function moveBrandTask(
  actor: Actor,
  input: { brandId: string; id: string; beforeId: string | null },
  client: Client = db,
) {
  await requireTaskBrand(actor.orgId, input.brandId, client);
  const tasks = await client.query.brandTaskTable.findMany({
    where: taskWhere(input.brandId),
    orderBy: [asc(brandTaskTable.sortOrder), asc(brandTaskTable.id)],
    columns: { id: true, sortOrder: true },
  });
  if (!tasks.some((task) => task.id === input.id))
    throw new ORPCError("NOT_FOUND", { message: "Task not found" });
  if (input.beforeId === input.id) return { id: input.id };
  const others = tasks.filter((task) => task.id !== input.id);
  const index =
    input.beforeId === null
      ? others.length
      : others.findIndex((task) => task.id === input.beforeId);
  if (index < 0)
    throw new ORPCError("NOT_FOUND", { message: "Destination task not found" });
  const ordered = [
    ...others.slice(0, index),
    { id: input.id, sortOrder: 0 },
    ...others.slice(index),
  ];
  await client
    .update(brandTaskTable)
    .set({
      sortOrder: sql`case ${sql.join(
        ordered.map(
          (task, i) =>
            sql`when ${brandTaskTable.id} = ${task.id} then ${i}::integer`,
        ),
        sql` `,
      )} else ${brandTaskTable.sortOrder} end`,
    })
    .where(taskWhere(input.brandId));
  return { id: input.id };
}

export async function restoreBrandTask(
  actor: Actor,
  input: { brandId: string; id: string },
  client: Client = db,
) {
  await requireTaskBrand(actor.orgId, input.brandId, client);
  const [task] = await client
    .update(brandTaskTable)
    .set({ deletedAt: null })
    .where(
      and(
        eq(brandTaskTable.brandId, input.brandId),
        eq(brandTaskTable.id, input.id),
      ),
    )
    .returning();
  if (!task) throw new ORPCError("NOT_FOUND", { message: "Task not found" });
  return { id: task.id };
}
