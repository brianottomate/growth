import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db";
import * as schema from "@/server/db/schema";
import { DEFAULT_CLIENT_TASKS } from "@/lib/brand-task";
import {
  createBrandTask,
  initializeBrandTasks,
  listBrandTasks,
  moveBrandTask,
  removeBrandTask,
  restoreBrandTask,
  updateBrandTask,
} from "./brand-task.service";

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE "user" (id text PRIMARY KEY, name text, image text);
    CREATE TABLE member (id text PRIMARY KEY, user_id text, organization_id text);
    CREATE TABLE brand (id text PRIMARY KEY, organization_id text, deleted_at timestamp,
      relationship text, performance_checklist jsonb, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    INSERT INTO "user" VALUES ('brooke', 'Brooke', null), ('designer', 'Designer', null), ('outsider', 'Outside', null);
    INSERT INTO member VALUES ('m1', 'brooke', 'org'), ('m2', 'designer', 'org'), ('m3', 'outsider', 'other');
    INSERT INTO brand (id, organization_id, relationship) VALUES ('client', 'org', 'client'), ('sibling', 'org', 'prospect'), ('foreign', 'other', 'client');
    INSERT INTO brand (id, organization_id, relationship, performance_checklist) VALUES
      ('historical', 'org', 'prospect', '{"values":{"metaConnected":"yes","googleBilling":"in_progress"},"meta":{"metaConnected":{"by":"brooke","at":"2026-10-01T12:00:00Z"}}}');
  `);
  const migration = await Bun.file(
    new URL("../../../drizzle/0029_brand_tasks.sql", import.meta.url),
  ).text();
  await pg.exec(migration.replaceAll("--> statement-breakpoint", ""));
  const client = drizzle(pg, {
    schema,
    casing: "snake_case",
  }) as unknown as Database;
  return { pg, client };
}

const actor = { orgId: "org", userId: "brooke" };
const fields = {
  title: "Check pixel events",
  notes: null,
  category: "ads_infrastructure" as const,
  tags: ["meta", "pixel", "tracking"],
  status: "todo" as const,
  assigneeUserId: "designer",
  dueDate: "2026-11-01",
};

test("brand tasks preserve creator identity and reject cross-brand edits and outside assignees", async () => {
  const { pg, client } = await fixture();
  try {
    const task = await createBrandTask(
      actor,
      { brandId: "client", ...fields },
      client,
    );
    const edited = await updateBrandTask(
      { ...actor, userId: "designer" },
      {
        brandId: "client",
        id: task.id,
        patch: { status: "done", assigneeUserId: "brooke" },
      },
      client,
    );
    expect(edited.createdByUserId).toBe("brooke");
    expect(edited.completedByUserId).toBe("designer");
    expect(edited.assigneeUserId).toBe("brooke");
    expect(edited.tags).toEqual(["meta", "pixel", "tracking"]);
    expect(edited.dueDate).toBe("2026-11-01");
    const failures = [
      [
        createBrandTask(actor, { brandId: "foreign", ...fields }, client),
        "Brand not found",
      ],
      [listBrandTasks("other", "client", client), "Brand not found"],
      [
        updateBrandTask(
          actor,
          { brandId: "sibling", id: task.id, patch: { title: "Wrong brand" } },
          client,
        ),
        "Task not found",
      ],
      [
        removeBrandTask(actor, { brandId: "sibling", id: task.id }, client),
        "Task not found",
      ],
      [
        restoreBrandTask(actor, { brandId: "sibling", id: task.id }, client),
        "Task not found",
      ],
      [
        moveBrandTask(
          actor,
          { brandId: "sibling", id: task.id, beforeId: null },
          client,
        ),
        "Task not found",
      ],
      [
        updateBrandTask(
          actor,
          {
            brandId: "client",
            id: task.id,
            patch: { assigneeUserId: "outsider" },
          },
          client,
        ),
        "Not in this organization",
      ],
      [
        createBrandTask(
          actor,
          { brandId: "client", ...fields, assigneeUserId: "outsider" },
          client,
        ),
        "Not in this organization",
      ],
    ] as const;
    const outcomes = await Promise.all(
      failures.map(async ([pending, message]) => {
        const error: unknown = await pending.catch(
          (failure: unknown) => failure,
        );
        return { error, message };
      }),
    );
    for (const { error, message } of outcomes)
      expect(error instanceof Error ? error.message : null).toContain(message);
    expect(
      (await listBrandTasks("org", "client", client)).find(
        (row) => row.id === task.id,
      )?.title,
    ).toBe(fields.title);
  } finally {
    await pg.close();
  }
}, 30000);

test("template initialization preserves client edits, completion and deliberate removals", async () => {
  const { pg, client } = await fixture();
  try {
    const migrated = await listBrandTasks("org", "historical", client);
    expect(
      migrated.find((task) => task.templateKey === "metaConnected"),
    ).toMatchObject({
      status: "done",
      createdByUserId: null,
      completedByUserId: "brooke",
    });
    expect(
      migrated.find((task) => task.templateKey === "googleBilling")?.status,
    ).toBe("in_progress");
    let tasks = await listBrandTasks("org", "client", client);
    expect(tasks).toHaveLength(DEFAULT_CLIENT_TASKS.length);
    expect(
      tasks.every(
        (task) =>
          task.status === "todo" &&
          task.assigneeUserId === null &&
          task.createdByUserId === null,
      ),
    ).toBe(true);
    const first = tasks[0]!;
    const removed = tasks[1]!;
    await updateBrandTask(
      actor,
      {
        brandId: "client",
        id: first.id,
        patch: {
          title: "Client-specific copy",
          assigneeUserId: "designer",
          status: "done",
        },
      },
      client,
    );
    await removeBrandTask(actor, { brandId: "client", id: removed.id }, client);
    await initializeBrandTasks("client", "brooke", client);
    tasks = await listBrandTasks("org", "client", client);
    expect(tasks).toHaveLength(DEFAULT_CLIENT_TASKS.length - 1);
    expect(tasks.find((task) => task.id === first.id)).toMatchObject({
      title: "Client-specific copy",
      assigneeUserId: "designer",
      status: "done",
    });
    expect(tasks.some((task) => task.templateKey === removed.templateKey)).toBe(
      false,
    );
    await restoreBrandTask(
      actor,
      { brandId: "client", id: removed.id },
      client,
    );
    expect(
      (await listBrandTasks("org", "client", client)).some(
        (task) => task.id === removed.id,
      ),
    ).toBe(true);
    const custom = await createBrandTask(
      actor,
      { brandId: "client", ...fields },
      client,
    );
    await moveBrandTask(
      actor,
      { brandId: "client", id: custom.id, beforeId: first.id },
      client,
    );
    expect((await listBrandTasks("org", "client", client))[0]?.id).toBe(
      custom.id,
    );
    await client
      .delete(schema.memberTable)
      .where(eq(schema.memberTable.userId, "brooke"));
    expect(
      (await listBrandTasks("org", "client", client)).find(
        (task) => task.id === custom.id,
      )?.creator?.name,
    ).toBe("Brooke");
  } finally {
    await pg.close();
  }
}, 30000);
