/**
 * Adapted from PR #628 acceptance coverage for reusable home-group sharing.
 * Run ONLY through the parent acceptance test: this process owns mock.module.
 * All service operations, WHERE clauses, joins and transactions use real SQL.
 * Existing dependency tables are reduced fixtures; collection DDL is the actual
 * generated migration discovered at runtime, not a second hand-written schema.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { createRouterClient, type AnyRouter } from "@orpc/server";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/never_connect";
// No provider or production DB may be reached, even if an unexpected import
// attempts it. WASM initialization below uses local package assets only.
const noNetwork = (): never => {
  throw new Error("Network access is forbidden in collection acceptance tests");
};
globalThis.fetch = Object.assign(noNetwork, { preconnect: noNetwork });
await mock.module("server-only", () => ({}));
const noSession = async () => null;
await mock.module("@/server/better-auth", () => ({
  auth: { api: { getSession: noSession } },
}));
await mock.module("@/server/better-auth/server", () => ({
  getSession: noSession,
}));

const schema = await import("@/server/db/schema");
const pg = new PGlite();
const database = drizzle(pg, { schema, casing: "snake_case" });
await mock.module("@/server/db", () => ({
  db: database,
  withTransaction: (callback: Parameters<typeof database.transaction>[0]) =>
    database.transaction(callback),
}));

type Actor = { orgId: string; userId: string };
type Save = {
  id?: string;
  title: string;
  homeIds: string[];
  expectedRevision?: number;
};
type Revision = { id: string; expectedRevision: number };
type Collection = {
  id: string;
  title: string;
  revision: number;
  shareToken: string | null;
  homeIds: string[];
};
type Home = {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  heroSourceUrl: string | null;
  url: string;
};
type PublicCollection = import("@/lib/home-group-shares").PublicHomeGroup;
type Service = {
  listHomeGroupShareHomes(orgId: string): Promise<Home[]>;
  listHomeGroupShares(orgId: string): Promise<Collection[]>;
  saveHomeGroupShare(input: Save, actor: Actor): Promise<Collection>;
  deleteHomeGroupShare(input: Revision, actor: Actor): Promise<{ id: string }>;
  revokeHomeGroupShare(input: Revision, actor: Actor): Promise<Collection>;
  renewHomeGroupShareLink(input: Revision, actor: Actor): Promise<Collection>;
  shareExistingHomeGroup(
    input: Revision & { title: string },
    actor: Actor,
  ): Promise<Collection>;
  getPublicHomeGroupShare(token: string): Promise<PublicCollection | null>;
};

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const snake = (value: string) =>
  value.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const dependencies = [
  schema.organizationTable,
  schema.userTable,
  schema.memberTable,
  schema.brandTable,
  schema.homeTable,
  schema.amplifierTable,
];

async function dependencyTables() {
  const enumNames = new Set<string>();
  for (const table of dependencies) {
    const config = getTableConfig(table as PgTable);
    for (const column of config.columns) {
      if (column.columnType !== "PgEnumColumn") continue;
      const type = column.getSQLType();
      if (enumNames.has(type)) continue;
      enumNames.add(type);
      await pg.exec(
        `CREATE TYPE ${quote(type)} AS ENUM (${column.enumValues!.map(literal).join(", ")})`,
      );
    }
    // Include baseline columns so a legitimate SELECT * works. Only dependency
    // PKs are constraints here: unrelated billing/media/auth FKs are out of scope.
    // New collection tables retain EVERY constraint in their actual migration.
    await pg.exec(
      `CREATE TABLE ${quote(config.name)} (${config.columns
        .filter(
          (column) =>
            config.name !== "amplifier" ||
            !["email", "phone"].includes(column.name),
        )
        .map(
          (column) =>
            `${quote(snake(column.name))} ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`,
        )
        .join(", ")})`,
    );
  }
}

async function collectionMigration() {
  const initial = readFileSync(
    join(process.cwd(), "drizzle/0000_initial.sql"),
    "utf8",
  );
  // Use the existing group DDL plus the actual proposed forward migration.
  for (const statement of initial.split("--> statement-breakpoint")) {
    if (
      /CREATE TYPE "public"\."home_group_kind"|CREATE TABLE "home_group"|CREATE TABLE "home_group_member"|CREATE TABLE "booking_target"|ALTER TABLE "home_group" ADD CONSTRAINT|ALTER TABLE "home_group_member" ADD CONSTRAINT|CREATE (?:UNIQUE )?INDEX "home_group/.test(
        statement,
      )
    )
      await pg.exec(statement);
  }
  await pg.exec(
    readFileSync(
      join(process.cwd(), "drizzle/0001_home_group_primary_source.sql"),
      "utf8",
    ),
  );
  await pg.exec(
    `ALTER TYPE home_group_source RENAME VALUE 'manual' TO 'custom'; DROP INDEX home_group_featured_unique; ALTER TABLE home_group DROP COLUMN kind; DROP TYPE home_group_kind;`,
  );
  const directory = join(process.cwd(), "drizzle");
  const filename = readdirSync(directory).find((name) =>
    name.endsWith("_shareable_home_groups.sql"),
  );
  assert.ok(filename, "Missing shared home group migration");
  await pg.exec(readFileSync(join(directory, filename), "utf8"));
  await pg.exec(
    readFileSync(join(directory, "0049_influencer_partnerships.sql"), "utf8"),
  );
}

async function insert(table: string, row: Record<string, unknown>) {
  const entries = Object.entries(row);
  await pg.query(
    `INSERT INTO ${quote(table)} (${entries.map(([key]) => quote(key)).join(", ")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(", ")})`,
    entries.map(([, value]) =>
      value !== null && typeof value === "object"
        ? JSON.stringify(value)
        : value,
    ),
  );
}
const actor: Actor = {
  orgId: "org_wander_fixture",
  userId: "usr_operator_fixture",
};
const foreignActor: Actor = {
  orgId: "org_foreign_fixture",
  userId: "usr_foreign_fixture",
};
const now = "2026-10-07T00:00:00.000Z";
const h1 = "home_internal_alpha";
const h2 = "home_internal_beta";
const foreign = "home_internal_foreign";
const b1 = "brand_private_alpha";
const b2 = "brand_private_beta";
const homeFacts = new Map<
  string,
  { name: string; url: string; photoUrl: string }
>();
const displayName = (id: string) => homeFacts.get(id)!.name;
const privateMarkers = [
  "PRIVATE_CLIENT_NAME",
  "PRIVATE_CONTACT",
  "PRIVATE_BILLING",
  "PRIVATE_NOTE",
  "PRIVATE_STREET",
  "PRIVATE_SUBSCRIPTION",
];

async function brand(
  id: string,
  orgId = actor.orgId,
  relationship = "client",
  deletedAt: string | null = null,
) {
  await insert("brand", {
    id,
    organization_id: orgId,
    owner_id: actor.userId,
    name: `PRIVATE_CLIENT_NAME_${id}`,
    type: "company",
    relationship,
    deleted_at: deletedAt,
    created_at: now,
    updated_at: now,
    is_active: true,
    wander_os_enabled: false,
    legal_identity: {
      email: "PRIVATE_CONTACT@example.invalid",
      phone: "PRIVATE_CONTACT",
      address: {
        line1: "PRIVATE_STREET",
        city: "PRIVATE_STREET",
        country: "US",
      },
    },
    performance_settings: {
      monthlyFee: 87654321,
      internalNotes: "PRIVATE_BILLING",
    },
    description: "PRIVATE_NOTE",
  });
}
async function home(
  id: string,
  brandId: string,
  patch: Record<string, unknown> = {},
) {
  const number = homeFacts.size + 1;
  const facts = {
    name: `Fixture stay ${number}`,
    url: `https://listings.example.test/stays/${number}`,
    photoUrl: `https://photos.example.test/${number}.jpg`,
  };
  homeFacts.set(id, facts);
  await insert("home", {
    id,
    brand_id: brandId,
    source: "manual",
    external_id: `external_not_primary_${id}`,
    name: facts.name,
    url: facts.url,
    url_key: facts.url,
    hero_source_url: facts.photoUrl,
    city: "Bend",
    state: "Oregon",
    country: "US",
    description: "PRIVATE_NOTE PRIVATE_STREET",
    ai_notes: { note: "PRIVATE_NOTE" },
    nightly_from: 87654321,
    cheapest_stay: { priceCents: 87654321, checkIn: "PRIVATE_BILLING" },
    catalog_excluded: false,
    created_at: now,
    updated_at: now,
    ...patch,
  });
}
let tables: string[] = [];
async function reset() {
  homeFacts.clear();
  await pg.exec(`TRUNCATE ${tables.map(quote).join(", ")} CASCADE`);
  for (const [id, slug] of [
    [actor.orgId, "wander"],
    [foreignActor.orgId, "foreign"],
  ]) {
    await insert("organization", {
      id,
      slug,
      name: slug,
      plan: "free",
      created_at: now,
      updated_at: now,
      subscription_id: "PRIVATE_SUBSCRIPTION",
    });
  }
  for (const user of [actor, foreignActor]) {
    await insert("user", {
      id: user.userId,
      name: "Operator",
      email: "PRIVATE_CONTACT@example.invalid",
      email_verified: true,
      created_at: now,
      updated_at: now,
    });
    await insert("member", {
      id: `member_${user.userId}`,
      user_id: user.userId,
      organization_id: user.orgId,
      role: "member",
      created_at: now,
    });
  }
  await brand(b1);
  await brand(b2);
  await brand("brand_foreign", foreignActor.orgId);
  await brand("brand_deleted", actor.orgId, "client", now);
  for (const relationship of ["prospect", "reference", "internal"])
    await brand(`brand_${relationship}`, actor.orgId, relationship);
  await home(h1, b1);
  await home(h2, b2);
  await home(foreign, "brand_foreign");
  await home("home_deleted", b1, { deleted_at: now });
  await home("home_deleted_brand", "brand_deleted");
  for (const relationship of ["prospect", "reference", "internal"])
    await home(`home_${relationship}`, `brand_${relationship}`);
}
async function snapshot() {
  return Promise.all(
    tables.map(async (table) => {
      const { rows } = await pg.query<{ row: Record<string, unknown> }>(
        `SELECT to_jsonb(t) AS row FROM ${quote(table)} t`,
      );
      return [table, rows.map(({ row }) => JSON.stringify(row)).sort()];
    }),
  );
}
async function rejectAtomically(operation: () => Promise<unknown>) {
  const before = await snapshot();
  await assert.rejects(operation);
  assert.deepEqual(
    await snapshot(),
    before,
    "A rejected operation must not change any committed row, membership, token, or revision",
  );
}
function token(value: string | null): string {
  assert.equal(typeof value, "string");
  assert.match(value!, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(value!, "base64url").length, 32);
  assert.equal(Buffer.from(value!, "base64url").toString("base64url"), value);
  return value!;
}
function fields({
  id,
  title,
  revision,
  shareToken,
  homeIds,
}: Collection): Collection {
  return { id, title, revision, shareToken, homeIds };
}
function internal(value: Collection, expected: Omit<Collection, "id">) {
  assert.equal(typeof value.id, "string");
  assert.ok(value.id);
  for (const key of ["title", "revision", "shareToken", "homeIds"] as const)
    assert.deepEqual(value[key], expected[key]);
}
function publicAllowlist(value: PublicCollection | null) {
  assert.ok(value);
  assert.deepEqual(Object.keys(value).sort(), ["homes", "title"]);
  assert.equal(typeof value.title, "string");
  assert.ok(Array.isArray(value.homes));
  for (const selected of value.homes) {
    assert.deepEqual(Object.keys(selected).sort(), [
      "key",
      "location",
      "name",
      "photoUrl",
      "url",
    ]);
    assert.equal(typeof selected.name, "string");
    assert.ok(
      selected.location === null || typeof selected.location === "string",
    );
    for (const key of ["photoUrl", "url"] as const) {
      const href = selected[key];
      assert.ok(href === null || typeof href === "string");
      if (href !== null) {
        const parsed = new URL(href);
        assert.ok(["http:", "https:"].includes(parsed.protocol));
        assert.equal(parsed.username, "");
        assert.equal(parsed.password, "");
      }
    }
  }
  for (const marker of privateMarkers)
    assert.ok(
      !JSON.stringify(value).includes(marker),
      `Public output leaked ${marker}`,
    );
  return value;
}

// Import via the contract path, not a mock service or a reimplementation.
const servicePath = "../../src/server/services/home-group-shares.service.ts";
const routerPath = "../../src/server/api/routers/homeGroupShares.router.ts";
let service: Service;
const save = (input: Save, by = actor) => service.saveHomeGroupShare(input, by);
const list = (orgId = actor.orgId) => service.listHomeGroupShares(orgId);
const publicRead = (value: string) => service.getPublicHomeGroupShare(value);
const revision = (collection: Collection): Revision => ({
  id: collection.id,
  expectedRevision: collection.revision,
});

async function lifecycle() {
  assert.deepEqual(
    (await service.listHomeGroupShareHomes(actor.orgId))
      .map((h) => h.id)
      .sort(),
    [h1, h2].sort(),
  );
  const selected = (await service.listHomeGroupShareHomes(actor.orgId)).find(
    (h) => h.id === h1,
  )!;
  assert.equal(selected.brandId, b1);
  assert.equal(selected.brandName, `PRIVATE_CLIENT_NAME_${b1}`);
  assert.equal(selected.name, displayName(h1));
  assert.equal(selected.city, "Bend");
  assert.equal(selected.state, "Oregon");
  assert.equal(selected.country, "US");
  assert.equal(selected.heroSourceUrl, homeFacts.get(h1)!.photoUrl);
  assert.equal(selected.url, homeFacts.get(h1)!.url);
  const created = await save({
    title: "  Two clients, one trip  ",
    homeIds: [h2, h1],
  });
  const initial = token(created.shareToken);
  internal(created, {
    title: "Two clients, one trip",
    revision: 0,
    shareToken: initial,
    homeIds: [h2, h1],
  });
  assert.deepEqual((await list()).map(fields), [fields(created)]);
  assert.deepEqual(await list(foreignActor.orgId), []);
  assert.deepEqual(
    publicAllowlist(await publicRead(initial)).homes.map((h) => h.name),
    [displayName(h2), displayName(h1)],
  );
  const edited = await save({
    id: created.id,
    title: "New itinerary",
    homeIds: [h1, h2],
    expectedRevision: 0,
  });
  internal(edited, {
    title: "New itinerary",
    revision: 1,
    shareToken: initial,
    homeIds: [h1, h2],
  });
  assert.deepEqual(
    publicAllowlist(await publicRead(initial)).homes.map((h) => h.name),
    [displayName(h1), displayName(h2)],
  );
  const revoked = await service.revokeHomeGroupShare(revision(edited), actor);
  internal(revoked, {
    title: edited.title,
    revision: 2,
    shareToken: null,
    homeIds: [h1, h2],
  });
  assert.equal(await publicRead(initial), null);
  const afterSave = await save({
    ...revision(revoked),
    title: "Still private",
    homeIds: [h2],
  });
  internal(afterSave, {
    title: "Still private",
    revision: 3,
    shareToken: null,
    homeIds: [h2],
  });
  assert.equal(await publicRead(initial), null);
  const renewed = await service.renewHomeGroupShareLink(
    revision(afterSave),
    actor,
  );
  const fresh = token(renewed.shareToken);
  assert.notEqual(fresh, initial);
  internal(renewed, {
    title: afterSave.title,
    revision: 4,
    shareToken: fresh,
    homeIds: [h2],
  });
  assert.equal(await publicRead(initial), null);
  assert.equal(publicAllowlist(await publicRead(fresh)).title, "Still private");
  const rotated = await service.renewHomeGroupShareLink(
    revision(renewed),
    actor,
  );
  const newest = token(rotated.shareToken);
  assert.notEqual(newest, fresh);
  assert.notEqual(newest, initial);
  internal(rotated, {
    title: afterSave.title,
    revision: 5,
    shareToken: newest,
    homeIds: [h2],
  });
  assert.equal(await publicRead(fresh), null);
  assert.equal(await publicRead(initial), null);
  publicAllowlist(await publicRead(newest));
  const another = await save({ title: "Independent link", homeIds: [h1] });
  assert.ok(![initial, fresh, newest].includes(token(another.shareToken)));
  for (const unknown of [
    "",
    "not-a-token",
    "A".repeat(43),
    "' OR 1=1 --",
    `${newest}x`,
  ])
    assert.equal(await publicRead(unknown), null);
}

async function tenantAndSelection() {
  const local = await save({ title: "Local", homeIds: [h1, h2] });
  const remote = await save(
    { title: "Foreign private title", homeIds: [foreign] },
    foreignActor,
  );
  assert.deepEqual(
    (await list()).map((c) => c.id),
    [local.id],
  );
  assert.deepEqual(
    (await list(foreignActor.orgId)).map((c) => c.id),
    [remote.id],
  );
  assert.deepEqual(
    (await service.listHomeGroupShareHomes(foreignActor.orgId)).map(
      (h) => h.id,
    ),
    [foreign],
  );
  for (const [target, intruder, chosen] of [
    [remote, actor, h1],
    [local, foreignActor, foreign],
  ] as const) {
    await rejectAtomically(() =>
      save(
        { ...revision(target), title: "Stolen", homeIds: [chosen] },
        intruder,
      ),
    );
    await rejectAtomically(() =>
      service.revokeHomeGroupShare(revision(target), intruder),
    );
    await rejectAtomically(() =>
      service.renewHomeGroupShareLink(revision(target), intruder),
    );
  }
  for (const invalid of [
    foreign,
    "home_missing",
    "home_deleted",
    "home_deleted_brand",
    "home_prospect",
    "home_reference",
    "home_internal",
    `external_not_primary_${h1}`,
    homeFacts.get(h1)!.url,
  ]) {
    // Both paths include a valid row: partial inserts/deletes must roll back.
    await rejectAtomically(() =>
      save({ title: "Invalid create", homeIds: [h1, invalid] }),
    );
    await rejectAtomically(() =>
      save({
        ...revision(local),
        title: "Invalid update",
        homeIds: [h2, invalid],
      }),
    );
  }
  assert.equal(
    publicAllowlist(await publicRead(token(remote.shareToken))).title,
    remote.title,
  );
  assert.deepEqual(
    publicAllowlist(await publicRead(token(local.shareToken))).homes.map(
      (h) => h.name,
    ),
    [displayName(h1), displayName(h2)],
  );
}

async function eligibilityAfterSharing() {
  for (const suffix of ["delete_brand", "move_brand", "demote_brand"])
    await brand(`brand_${suffix}`);
  const changes = [
    "home_soft_delete",
    "home_reparent",
    "home_brand_delete",
    "home_brand_move",
    "home_brand_demote",
  ];
  await home(changes[0]!, b1);
  await home(changes[1]!, b1);
  await home(changes[2]!, "brand_delete_brand");
  await home(changes[3]!, "brand_move_brand");
  await home(changes[4]!, "brand_demote_brand");
  const created = await save({
    title: "Eligibility is live",
    homeIds: [h1, ...changes],
  });
  const link = token(created.shareToken);
  assert.equal(publicAllowlist(await publicRead(link)).homes.length, 6);
  await pg.query("UPDATE home SET deleted_at = $1 WHERE id = $2", [
    now,
    changes[0],
  ]);
  await pg.query("UPDATE home SET brand_id = $1 WHERE id = $2", [
    "brand_foreign",
    changes[1],
  ]);
  await pg.query("UPDATE brand SET deleted_at = $1 WHERE id = $2", [
    now,
    "brand_delete_brand",
  ]);
  await pg.query("UPDATE brand SET organization_id = $1 WHERE id = $2", [
    foreignActor.orgId,
    "brand_move_brand",
  ]);
  await pg.query("UPDATE brand SET relationship = $1 WHERE id = $2", [
    "prospect",
    "brand_demote_brand",
  ]);
  assert.deepEqual(
    publicAllowlist(await publicRead(link)).homes.map((h) => h.name),
    [displayName(h1)],
  );
  const eligible = (await service.listHomeGroupShareHomes(actor.orgId)).map(
    (h) => h.id,
  );
  for (const id of changes) {
    assert.ok(!eligible.includes(id));
    await rejectAtomically(() =>
      save({ ...revision(created), title: "Must reject", homeIds: [h1, id] }),
    );
  }
  await pg.query("UPDATE home SET deleted_at = $1 WHERE id = $2", [now, h1]);
  assert.deepEqual(publicAllowlist(await publicRead(link)).homes, []);
}

async function publicPrivacyAndUrls() {
  const created = await save({
    title: "Only approved facts",
    homeIds: [h2, h1],
  });
  const link = token(created.shareToken);
  const result = publicAllowlist(await publicRead(link));
  assert.equal(result.title, created.title);
  assert.deepEqual(
    result.homes.map((h) => h.name),
    [displayName(h2), displayName(h1)],
  );
  for (const h of result.homes) {
    for (const place of ["Bend", "Oregon", "US"])
      assert.ok(h.location?.includes(place));
  }
  // Public names and URLs deliberately contain no internal IDs, so even an
  // ID smuggled into an allowed string field is detectable.
  for (const secret of [
    actor.orgId,
    actor.userId,
    h1,
    h2,
    b1,
    b2,
    created.id,
    link,
    ...privateMarkers,
  ])
    assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.homes[0]!.url, homeFacts.get(h2)!.url);
  assert.equal(result.homes[0]!.photoUrl, homeFacts.get(h2)!.photoUrl);
  const unsafe = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://user:password@example.test/a",
    "https://user@example.test/a",
    "http://%75ser:%70ass@example.test/a",
    "//example.test/a",
    "/relative",
    "ftp://example.test/a",
    "file:///etc/passwd",
    "not a url",
    "",
  ];
  for (const value of unsafe) {
    await pg.query(
      "UPDATE home SET url = $1, hero_source_url = $1 WHERE id = $2",
      [value, h1],
    );
    const exposed = publicAllowlist(await publicRead(link)).homes.find(
      (h) => h.name === displayName(h1),
    )!;
    assert.ok(
      exposed,
      "Unsafe URLs must not silently remove an otherwise eligible home",
    );
    assert.equal(exposed.url, null, `Unsafe listing URL: ${value}`);
    assert.equal(exposed.photoUrl, null, `Unsafe photo URL: ${value}`);
  }
  for (const value of [
    "https://example.test/stay?source=collection#photos",
    "http://example.test/stay",
  ]) {
    await pg.query(
      "UPDATE home SET url = $1, hero_source_url = $1 WHERE id = $2",
      [value, h1],
    );
    const exposed = publicAllowlist(await publicRead(link)).homes.find(
      (h) => h.name === displayName(h1),
    )!;
    assert.equal(exposed.url, value);
    assert.equal(exposed.photoUrl, value);
  }
  await pg.query(
    "UPDATE home SET hero_source_url = NULL, city = NULL, state = NULL, country = NULL WHERE id = $1",
    [h1],
  );
  const noPhoto = publicAllowlist(await publicRead(link)).homes.find(
    (h) => h.name === displayName(h1),
  )!;
  assert.equal(noPhoto.photoUrl, null);
  assert.equal(noPhoto.location, null);
}

async function lastWriteWinsAndValidation() {
  const created = await save({ title: "Original", homeIds: [h1, h2] });
  const winner = await save({
    ...revision(created),
    title: "Saved work",
    homeIds: [h2],
  });
  await rejectAtomically(() =>
    service.revokeHomeGroupShare(revision(created), actor),
  );
  await rejectAtomically(() =>
    service.renewHomeGroupShareLink(revision(created), actor),
  );
  await save({ ...revision(created), title: "Last write", homeIds: [h1] });
  await save({ id: created.id, title: "No revision required", homeIds: [h1] });
  const outcomes = await Promise.allSettled([
    save({ ...revision(winner), title: "Editor A", homeIds: [h1] }),
    save({ ...revision(winner), title: "Editor B", homeIds: [h2, h1] }),
  ]);
  const saved = outcomes.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : [],
  );
  assert.equal(
    saved.length,
    2,
    "Ordinary edits must not reject another editor's save",
  );
  const committed = {
    value: saved.reduce((latest, row) =>
      row.revision > latest.revision ? row : latest,
    ),
  };
  assert.equal(committed.value.revision, winner.revision + 4);
  assert.deepEqual((await list()).map(fields), [fields(committed.value)]);
  assert.equal(committed.value.shareToken, created.shareToken);
  assert.deepEqual(
    publicAllowlist(await publicRead(token(created.shareToken))).homes.map(
      (h) => h.name,
    ),
    committed.value.homeIds.map((id) => displayName(id)),
  );
  // Avoid a rejection-only validator that caps the size below the contract.
  const ids = Array.from({ length: 1000 }, (_, i) => `home_boundary_${i}`);
  for (const id of ids) await home(id, b1);
  const boundary = await save({ title: "x".repeat(120), homeIds: ids });
  assert.deepEqual(boundary.homeIds, ids);
  assert.equal(boundary.title.length, 120);
  for (const invalid of [
    { title: " ", homeIds: [h1] },
    { title: "x".repeat(121), homeIds: [h1] },
    { title: "Empty", homeIds: [] },
    { title: "Duplicate", homeIds: [h1, h1] },
    { title: "Too many", homeIds: [...ids, h1] },
  ]) {
    await rejectAtomically(() => save(invalid));
    await rejectAtomically(() =>
      save({ ...revision(committed.value), ...invalid }),
    );
  }
}

async function routerMembership() {
  const exported = (await import(routerPath)) as Record<string, unknown>;
  const names = [
    "clients",
    "remove",
    "homes",
    "list",
    "save",
    "revoke",
    "renew",
    "groups",
    "share",
  ];
  // The contract fixes endpoint names, not the router's TS export identifier.
  const routers = Object.values(exported).filter(
    (value) =>
      value &&
      typeof value === "object" &&
      names.every((name) => name in value),
  );
  assert.equal(
    routers.length,
    1,
    "Expected one home group share router with the approved endpoints",
  );
  const router = routers[0] as AnyRouter;
  assert.deepEqual(
    Object.keys(router).sort(),
    [...names].sort(),
    "Public reads must not get an RPC/list endpoint",
  );
  const session = {
    user: {
      id: actor.userId,
      name: "Operator",
      email: "PRIVATE_CONTACT@example.invalid",
    },
    // A stale session's preferred org must not override live Wander membership.
    session: {
      id: "session_fixture",
      userId: actor.userId,
      activeOrganizationId: foreignActor.orgId,
      expiresAt: new Date("2099-01-01"),
    },
  };
  type Client = Record<string, (input?: unknown) => Promise<unknown>>;
  const client = (authenticated: boolean) =>
    createRouterClient(router, {
      context: {
        db: database,
        session: authenticated ? session : null,
        headers: new Headers(),
        authApi: { getSession: noSession },
      },
    }) as Client;
  const member = client(true);
  assert.deepEqual(
    ((await member.homes!()) as Home[]).map((h) => h.id).sort(),
    [h1, h2].sort(),
  );
  let created = (await member.save!({
    title: "Ordinary member",
    homeIds: [h2, h1],
  })) as Collection;
  assert.deepEqual(
    ((await member.list!()) as Collection[]).map((c) => c.id),
    [created.id],
  );
  assert.deepEqual(await list(foreignActor.orgId), []);
  created = (await member.save!({
    ...revision(created),
    title: "Member edited",
    homeIds: [h1],
  })) as Collection;
  const initial = token(created.shareToken);
  created = (await member.revoke!(revision(created))) as Collection;
  assert.equal(created.shareToken, null);
  assert.equal(await publicRead(initial), null);
  created = (await member.renew!(revision(created))) as Collection;
  const fresh = token(created.shareToken);
  assert.notEqual(fresh, initial);
  publicAllowlist(await publicRead(fresh));
  const calls: [string, unknown][] = [
    ["clients", undefined],
    ["remove", revision(created)],
    ["list", undefined],
    ["homes", undefined],
    ["save", { ...revision(created), title: "Unauthorized", homeIds: [h2] }],
    ["revoke", revision(created)],
    ["renew", revision(created)],
  ];
  for (const [name, input] of calls) {
    const before = await snapshot();
    await assert.rejects(
      () => client(false)[name]!(input),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "UNAUTHORIZED",
    );
    assert.deepEqual(await snapshot(), before);
  }
  // Keep a valid foreign membership. Losing Wander access must not fall back
  // to that organization, nor trust this still-valid authentication session.
  await insert("member", {
    id: "member_other_workspace",
    user_id: actor.userId,
    organization_id: foreignActor.orgId,
    role: "member",
    created_at: now,
  });
  await pg.query(
    "DELETE FROM member WHERE user_id = $1 AND organization_id = $2",
    [actor.userId, actor.orgId],
  );
  for (const [name, input] of calls) {
    const before = await snapshot();
    await assert.rejects(
      () => member[name]!(input),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "FORBIDDEN",
    );
    assert.deepEqual(await snapshot(), before);
  }
  // The unlisted link is intentionally independent of the viewer's login.
  publicAllowlist(await publicRead(fresh));
}

async function existingGroupSharing() {
  const group = {
    id: "existing_group",
    brand_id: b1,
    name: "PRIVATE_CLIENT_NAME picks",
    source: "custom",
    is_primary: true,
    created_at: now,
    updated_at: now,
  };
  await insert("home_group", group);
  await insert("home_group_member", {
    group_id: group.id,
    home_id: h1,
    sort_order: 0,
  });
  const shared = await service.shareExistingHomeGroup(
    { id: group.id, expectedRevision: 0, title: "Public picks" },
    actor,
  );
  assert.equal(shared.id, group.id);
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "select count(*)::int as count from home_group",
      )
    ).rows[0]!.count,
    1,
  );
  assert.equal(
    (
      await pg.query<{ name: string }>(
        "select name from home_group where id = $1",
        [group.id],
      )
    ).rows[0]!.name,
    group.name,
  );
  assert.equal(
    publicAllowlist(await publicRead(token(shared.shareToken))).homes.length,
    1,
  );
  await rejectAtomically(() =>
    service.shareExistingHomeGroup(
      { id: group.id, expectedRevision: shared.revision, title: "Again" },
      actor,
    ),
  );
  await rejectAtomically(() =>
    save({
      ...revision(shared),
      title: "Cannot replace primary selection",
      homeIds: [h2],
    }),
  );
  const titled = await save({
    ...revision(shared),
    title: "New public title",
    homeIds: [h1],
  });
  assert.equal(
    publicAllowlist(await publicRead(token(titled.shareToken))).title,
    "New public title",
  );
  // An already shared brand moving workspaces must invalidate its old public boundary.
  await pg.query("update brand set organization_id = $1 where id = $2", [
    foreignActor.orgId,
    b1,
  ]);
  assert.equal(await publicRead(token(shared.shareToken)), null);
  await rejectAtomically(() =>
    service.revokeHomeGroupShare(revision(titled), actor),
  );
  await rejectAtomically(() =>
    service.renewHomeGroupShareLink(revision(titled), foreignActor),
  );
  assert.deepEqual(await list(foreignActor.orgId), []);
  await rejectAtomically(() =>
    service.deleteHomeGroupShare(revision(titled), actor),
  );
  await pg.query("update brand set organization_id = $1 where id = $2", [
    actor.orgId,
    b1,
  ]);
  await service.deleteHomeGroupShare(revision(titled), actor);
  assert.equal(await publicRead(token(titled.shareToken)), null);
  assert.equal(
    (await pg.query("select id from home_group where id=$1", [group.id])).rows
      .length,
    1,
  );
  assert.equal(
    (
      await pg.query(
        "select home_id from home_group_member where group_id=$1",
        [group.id],
      )
    ).rows.length,
    1,
  );
  // Workspace groups cannot become a brand's primary group.
  await assert.rejects(() =>
    pg.query(
      "insert into home_group (id, organization_id, name, source, is_primary) values ('bad_primary', $1, 'Bad', 'custom', true)",
      [actor.orgId],
    ),
  );
}

async function partnershipsScenario() {
  const {
    saveInfluencerPartnership: savePartnership,
    listInfluencerPartnerships: listPartnerships,
    deleteInfluencerPartnership: deletePartnership,
  } = await import("@/server/services/influencer-partnerships.service");
  for (const [id, org] of [
    ["creator_ours", actor.orgId],
    ["creator_foreign", foreignActor.orgId],
  ])
    await insert("amplifier", {
      id,
      organization_id: org,
      name: id,
      created_at: now,
      updated_at: now,
    });
  await rejectAtomically(() =>
    savePartnership(
      { amplifierId: "creator_foreign", brandId: b1 },
      actor.orgId,
    ),
  );
  await rejectAtomically(() =>
    savePartnership(
      { amplifierId: "creator_ours", brandId: "brand_foreign" },
      actor.orgId,
    ),
  );
  await rejectAtomically(() =>
    savePartnership(
      { amplifierId: "creator_ours", brandId: b1, homeId: h2 },
      actor.orgId,
    ),
  );
  await pg.query("update home set url=$1 where id=$2", [
    "https://booking.example.test/property/beach-song?checkin=2027-01-29&checkout=2027-02-01&guests=9&search_id=stale&utm_source=old",
    h1,
  ]);
  const own = await savePartnership(
    {
      amplifierId: "creator_ours",
      brandId: b1,
      homeId: h1,
      checkIn: "2026-12-01",
      checkOut: "2026-12-04",
      deliverables: "One Reel",
    },
    actor.orgId,
  );
  assert.equal(new URL(own.trackingUrl!).searchParams.get("utm_id"), own.id);
  assert.equal(new URL(own.trackingUrl!).searchParams.has("checkin"), false);
  assert.equal(
    new URL(own.trackingUrl!).searchParams.get("utm_source"),
    "influencer",
  );
  const patched = await savePartnership(
    { id: own.id, notes: "Agreement pending" },
    actor.orgId,
  );
  assert.equal(patched.deliverables, "One Reel");
  assert.equal(patched.checkIn, "2026-12-01");
  assert.equal(patched.trackingUrl, own.trackingUrl);
  await rejectAtomically(() =>
    savePartnership({ id: own.id, notes: "Foreign write" }, foreignActor.orgId),
  );
  await rejectAtomically(() => deletePartnership(own.id, foreignActor.orgId));
  await rejectAtomically(() =>
    savePartnership({ id: own.id, checkOut: "2026-11-30" }, actor.orgId),
  );
  assert.deepEqual(await listPartnerships({}, foreignActor.orgId), []);
  await pg.query("update home set brand_id=$1 where id=$2", [
    "brand_foreign",
    h1,
  ]);
  const moved = (await listPartnerships({}, actor.orgId)).find(
    (row) => row.id === own.id,
  )!;
  assert.equal(moved.trackingUrl, null);
  assert.equal(moved.homeName, null);
  await pg.query("update home set brand_id=$1 where id=$2", [b1, h1]);
  const repeat = await savePartnership(
    { amplifierId: "creator_ours", brandId: b1, homeId: h1 },
    actor.orgId,
  );
  assert.notEqual(repeat.id, own.id);
  await deletePartnership(own.id, actor.orgId);
  assert.equal((await listPartnerships({}, actor.orgId)).length, 1);
  assert.equal(
    (
      await pg.query(
        "select id from influencer_partnership where id=$1 and deleted_at is not null",
        [own.id],
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (await pg.query("select id from home where id=$1", [h1])).rows.length,
    1,
  );
  const generic = await save({ title: "Reusable gallery", homeIds: [h1, h2] });
  const link = token(generic.shareToken);
  const first = publicAllowlist(await publicRead(link));
  assert.deepEqual(publicAllowlist(await publicRead(link)), first);
  await service.deleteHomeGroupShare(revision(generic), actor);
  assert.equal(await publicRead(link), null);
  assert.equal((await listPartnerships({}, actor.orgId)).length, 1);
}

try {
  await dependencyTables();
  await collectionMigration();
  tables = (
    await pg.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    )
  ).rows.map((row) => row.tablename);
  service = (await import(servicePath)) as Service;
  for (const scenario of [
    lifecycle,
    tenantAndSelection,
    eligibilityAfterSharing,
    publicPrivacyAndUrls,
    lastWriteWinsAndValidation,
    routerMembership,
    existingGroupSharing,
    partnershipsScenario,
  ]) {
    await reset();
    try {
      await scenario();
    } catch (error) {
      throw new Error(`Acceptance scenario failed: ${scenario.name}`, {
        cause: error,
      });
    }
  }
  console.log("home group share acceptance: 8 scenarios passed");
} finally {
  await pg.close();
}
