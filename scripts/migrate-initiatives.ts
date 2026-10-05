/** Transactional, repeatable cutover. Caller must wrap all statements in one transaction. */
export type InitiativeMigrationConnection = {
  unsafe: (query: string) => PromiseLike<unknown>;
};
export async function migrateInitiatives(tx: InitiativeMigrationConnection) {
  const source = await Bun.file(
    new URL("./initiative-schema.sql", import.meta.url),
  ).text();
  for (const statement of source
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await tx.unsafe(statement);
  // information_schema determines whether the legacy columns still exist. Dynamic
  // queries are executed only while those columns are present, including on replay.
  const columns = (await tx.unsafe(
    "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('series', 'content_post') AND column_name = 'campaign_id'",
  )) as { table_name: string }[];
  for (const { table_name: table } of columns) {
    if (table !== "series" && table !== "content_post")
      throw new Error("Unexpected legacy table.");
    await tx.unsafe(`INSERT INTO public.initiative (id, organization_id, lead_brand_id, name, description, status, start_at, end_at, created_at, updated_at)
   SELECT 'init_' || c.id, b.organization_id, c.brand_id, c.name, c.description, c.status::text, c.start_at, c.end_at, now(), now()
   FROM public.campaign c JOIN public.brand b ON b.id = c.brand_id
   WHERE b.organization_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.${table} item WHERE item.campaign_id = c.id)
   ON CONFLICT (id) DO NOTHING`);
    const field = table === "series" ? "series_id" : "content_post_id";
    await tx.unsafe(`INSERT INTO public.initiative_member (id, initiative_id, ${field}, created_at)
   SELECT 'imem_' || item.id, 'init_' || item.campaign_id, item.id, now()
   FROM public.${table} item JOIN public.initiative i ON i.id = 'init_' || item.campaign_id
   JOIN public.brand b ON b.id = item.brand_id AND b.organization_id = i.organization_id
   ON CONFLICT DO NOTHING`);
    await tx.unsafe(`INSERT INTO public.initiative_member (id, initiative_id, campaign_id, created_at)
   SELECT 'imem_' || i.id, i.id, c.id, now() FROM public.initiative i JOIN public.campaign c ON i.id = 'init_' || c.id
   ON CONFLICT DO NOTHING`);
  }
  // VRMA may have no remaining series→campaign link, so explicitly preserve the
  // reviewed push as an initiative, without touching delivery/provider records.
  await tx.unsafe(`INSERT INTO public.initiative (id, organization_id, lead_brand_id, name, description, status, created_at, updated_at)
 SELECT 'init_' || c.id, b.organization_id, c.brand_id, 'VRMA 2026: The direct booking revolution',
 'Coordinate the VRMA organic content, paid drafts, and team amplification around the direct booking revolution. Full brief is on the linked conference content post.',
 'planned', now(), now() FROM public.campaign c JOIN public.brand b ON b.id = c.brand_id
 WHERE c.id = 'camp_VezPHGsaUwngW7Dj' AND b.organization_id = 'org_4Kpk3KEBWbQcTEa6'
 ON CONFLICT (id) DO NOTHING`);
  await tx.unsafe(`INSERT INTO public.initiative_member (id, initiative_id, campaign_id, created_at)
 SELECT 'imem_vrma_campaign', i.id, c.id, now() FROM public.initiative i JOIN public.campaign c ON c.id = 'camp_VezPHGsaUwngW7Dj'
 JOIN public.brand b ON b.id = c.brand_id AND b.organization_id = i.organization_id
 WHERE i.id = 'init_camp_VezPHGsaUwngW7Dj' ON CONFLICT DO NOTHING`);
  await tx.unsafe(`INSERT INTO public.initiative_member (id, initiative_id, series_id, created_at)
 SELECT 'imem_vrma_series', i.id, s.id, now() FROM public.initiative i JOIN public.series s ON s.id = 'series_cabGCKZhN29H52CP'
 JOIN public.brand b ON b.id = s.brand_id AND b.organization_id = i.organization_id
 WHERE i.id = 'init_camp_VezPHGsaUwngW7Dj' ON CONFLICT DO NOTHING`);
  await tx.unsafe(
    "ALTER TABLE public.series DROP COLUMN IF EXISTS campaign_id",
  );
  await tx.unsafe(
    "ALTER TABLE public.content_post DROP COLUMN IF EXISTS campaign_id",
  );
}
