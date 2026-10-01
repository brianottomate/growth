/** Exercises the migration and database boundaries, then rolls everything back. */
import postgres from "postgres";
import { env } from "@/env";
const client = postgres(env.DATABASE_URL, { max: 1 });
const rollback = new Error("verification rollback");
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
try {
  await client.begin(async (tx) => {
    const ddl = await Bun.file(
      new URL("./sql/home-groups-booking.sql", import.meta.url),
    ).text();
    await tx.unsafe(ddl);
    const [parity] =
      await tx`select count(*)::int as missing from home h where h.featured and h.deleted_at is null and not exists(select 1 from home_group_member m join home_group g on g.id = m.group_id where m.home_id = h.id and g.kind = 'featured' and g.brand_id = h.brand_id)`;
    assert(parity?.missing === 0, "Featured backfill missed homes");
    const [home] = await tx<
      { id: string; brand_id: string; group_id: string }[]
    >`select h.id, h.brand_id, g.id as group_id from home h join home_group g on g.brand_id = h.brand_id and g.kind = 'featured' where h.deleted_at is null limit 1`;
    assert(Boolean(home), "Need one active home to verify compatibility");
    await tx`update home set featured = false where id = ${home!.id}`;
    const [removed] =
      await tx`select count(*)::int as n from home_group_member where group_id = ${home!.group_id} and home_id = ${home!.id}`;
    assert(removed?.n === 0, "Legacy unfeature did not remove membership");
    await tx`insert into home_group_member(group_id, home_id, sort_order) values(${home!.group_id}, ${home!.id}, 4)`;
    const [featured] =
      await tx`select featured, sort_order from home where id = ${home!.id}`;
    assert(
      featured?.featured === true && featured.sort_order === 4,
      "Membership did not update legacy selection/order",
    );
    const [other] = await tx<
      { id: string }[]
    >`select id from home_group where brand_id <> ${home!.brand_id} limit 1`;
    assert(Boolean(other), "Need another brand to verify isolation");
    let rejected = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`insert into home_group_member(group_id, home_id) values(${other!.id}, ${home!.id})`;
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "Cross-brand membership was accepted");
    rejected = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`insert into booking_target(id, brand_id, name, home_group_id) values('btarget_verification', ${home!.brand_id}, 'Verification', ${other!.id})`;
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "Cross-brand booking selection was accepted");
    await tx`update brand set wander_os_enabled = false where id = ${home!.brand_id}`;
    await tx.unsafe(ddl);
    const [disabled] =
      await tx`select wander_os_enabled from brand where id = ${home!.brand_id}`;
    assert(
      disabled?.wander_os_enabled === false,
      "Migration re-enabled an explicitly disabled brand",
    );
    console.log(
      "Verified backfill, Featured compatibility/order, cross-brand membership/target rejection, and migration replay. Rolling back all verification changes.",
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await client.end();
}
