/**
 * Additive schema for Growth content-control parity.
 *
 * Rehearse this exact script on a temporary Neon branch. Running it against
 * production is an explicit release operation and is not part of build/deploy.
 *
 *   bun --conditions=react-server scripts/apply-content-parity-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.platform_post
    add column if not exists first_comment_text text,
    add column if not exists first_comment_status text,
    add column if not exists first_comment_error text,
    add column if not exists first_comment_updated_at timestamptz
`);

await db.execute(sql`
  alter table public.amplifier
    add column if not exists slack_user_id text
`);

await db.execute(sql`
  alter table public.amplification_target
    add column if not exists action_kind text not null default 'repost',
    add column if not exists draft_text text,
    add column if not exists slack_status text,
    add column if not exists slack_channel text,
    add column if not exists slack_message_ts text,
    add column if not exists slack_error text,
    add column if not exists slack_notified_at timestamptz
`);

await db.execute(sql`
  alter table public.ad_account
    add column if not exists brand_id text
`);

await db.execute(sql`
  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'ad_account_brand_id_brand_id_fk'
    ) then
      alter table public.ad_account
        add constraint ad_account_brand_id_brand_id_fk
        foreign key (brand_id) references public.brand(id) on delete restrict
        not valid;
    end if;
  end $$
`);

await db.execute(sql`
  update public.ad_account as account
  set brand_id = brand.id
  from public.brand as brand
  where brand.slug = 'wander'
    and brand.organization_id is not null
    and account.external_id in (
      'act_885632589057558',
      '3254449027',
      '6p848z'
    )
`);

await db.execute(sql`
  update public.ad_account as account
  set brand_id = brand.id
  from public.brand as brand
  where brand.slug = 'wanderos'
    and brand.organization_id is not null
    and account.external_id in (
      'act_770182659373783',
      'act_25178656948455284',
      '1808032462',
      '9709781352'
    )
`);

const unmappedAllowed = await db.execute(sql`
  select platform, external_id, name
  from public.ad_account
  where is_allowed = true and brand_id is null
`);
if (unmappedAllowed.rows.length > 0) {
  throw new Error(
    `Refusing to finish with allowed, unscoped ad accounts: ${JSON.stringify(unmappedAllowed.rows)}`,
  );
}

await db.execute(sql`
  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'ad_account_allowed_brand_check'
    ) then
      alter table public.ad_account
        add constraint ad_account_allowed_brand_check
        check (is_allowed = false or brand_id is not null)
        not valid;
    end if;
  end $$
`);

await db.execute(sql`
  alter table public.ad_account
    validate constraint ad_account_brand_id_brand_id_fk
`);

await db.execute(sql`
  alter table public.ad_account
    validate constraint ad_account_allowed_brand_check
`);

await db.execute(sql`
  create index if not exists ad_account_brand_idx
    on public.ad_account (brand_id)
`);

console.log("Growth content parity schema is ready.");
