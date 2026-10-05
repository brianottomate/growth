import type { TransactionSql } from "postgres";

/** One-time cutover. Re-running never restores deleted assignments or overrides contact preferences. */
export async function migrateAmplification(tx: TransactionSql) {
  await tx`select pg_advisory_xact_lock(hashtext('growth-amplification-destination-v1'))`;
  const [existing] = await tx<{ present: boolean }[]>`select exists (
    select 1 from information_schema.columns where table_schema='public'
    and table_name='amplification_target' and column_name='output_platform_post_id'
  ) as present`;
  await tx.unsafe(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='amplifier' AND column_name='promoted_brand_id') THEN
      ALTER TABLE public.amplifier RENAME COLUMN promoted_brand_id TO linked_brand_id;
    END IF;
  END $$`);
  await tx.unsafe(
    `ALTER TABLE public.amplifier ADD COLUMN IF NOT EXISTS handoff_preference text NOT NULL DEFAULT 'manual'`,
  );
  await tx.unsafe(
    `ALTER TABLE public.amplification_target ADD COLUMN IF NOT EXISTS destination_platform text`,
  );
  await tx.unsafe(
    `ALTER TABLE public.amplification_target ADD COLUMN IF NOT EXISTS output_platform_post_id text REFERENCES public.platform_post(id) ON DELETE SET NULL`,
  );
  await tx.unsafe(
    `UPDATE public.amplification_target t SET destination_platform=p.platform::text FROM public.platform_post p WHERE p.id=t.platform_post_id AND t.destination_platform IS NULL`,
  );
  await tx.unsafe(
    `ALTER TABLE public.amplification_target ALTER COLUMN destination_platform SET NOT NULL`,
  );
  await tx.unsafe(
    `DROP INDEX IF EXISTS public.amplification_target_unique_idx`,
  );
  await tx.unsafe(
    `CREATE UNIQUE INDEX amplification_target_unique_idx ON public.amplification_target(platform_post_id, amplifier_id, destination_platform, action_kind)`,
  );
  // Legacy managed drafts are linked only when exactly one candidate exists.
  // Do not move copy where it differs: leave ambiguous records for an operator.
  // The column's first introduction is the cutover marker. Subsequent deploys
  // must not reinterpret new assignments or restore deliberately removed links.
  if (existing?.present) return;
  await tx.unsafe(`WITH candidates AS (
    SELECT t.id, min(p.id) AS post_id FROM public.amplification_target t
    JOIN public.amplifier a ON a.id=t.amplifier_id
    JOIN public.platform_post_link l ON l.to_platform_post_id=t.platform_post_id AND l.kind=t.action_kind
    JOIN public.platform_post p ON p.id=l.from_platform_post_id AND p.brand_id=a.linked_brand_id AND p.platform::text=t.destination_platform
    WHERE t.output_platform_post_id IS NULL AND (t.draft_text IS NULL OR t.draft_text=p.text)
    GROUP BY t.id HAVING count(DISTINCT p.id)=1
  ) UPDATE public.amplification_target t SET output_platform_post_id=c.post_id, draft_text=NULL FROM candidates c WHERE t.id=c.id`);
}
