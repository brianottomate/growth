/** One-time additive cutover. The old table remains until the new release is Ready. */
import postgres from "postgres";
if (!process.argv.includes("--apply"))
  throw new Error("Pass --apply to apply the workflow cutover");
const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  onnotice: () => undefined,
});
try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('workflow-run-cutover'))`;
    const [state] =
      await tx`select to_regclass('public.workflow_run') is not null as present`;
    if (!state?.present) {
      const source = await Bun.file(
        new URL("./workflow-run-schema.sql", import.meta.url),
      ).text();
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await tx.unsafe(statement);
    }
    const [legacy] =
      await tx`select to_regclass('public.creative_run') is not null as present`;
    if (!legacy?.present) return;
    // New code never resumes legacy jobs; keep completed creative results and export URLs.
    await tx.unsafe(`INSERT INTO workflow_run (
      id,organization_id,brand_id,content_post_id,thread_id,packet_id,workflow_type,
      provider,kind,model,prompt,input,operation,result,provider_request_id,webhook_token_hash,
      status,candidates,provider_output,progress,accepted_media_asset_id,error,created_by,created_at,updated_at,completed_at,dismissed_at
    ) SELECT id,organization_id,brand_id,content_post_id,thread_id,packet_id,
      CASE WHEN provider IN ('starter-ads','wanderos-import','catalog-write','catalog-export') THEN provider ELSE 'creative-document' END,
      CASE WHEN provider IN ('starter-ads','wanderos-import','catalog-write','catalog-export') THEN 'internal' ELSE provider END,
      CASE WHEN provider IN ('starter-ads','wanderos-import','catalog-write','catalog-export') THEN NULL ELSE kind END,
      model,prompt,input,operation,result,provider_request_id,webhook_token_hash,
      (CASE status::text WHEN 'ready' THEN 'succeeded' WHEN 'cancelled' THEN 'cancelled' ELSE 'failed' END)::workflow_run_status,
      candidates,
      CASE WHEN provider IN ('starter-ads','wanderos-import','catalog-write','catalog-export') THEN NULL ELSE provider_output END,
      CASE WHEN provider IN ('starter-ads','wanderos-import','catalog-write','catalog-export') THEN coalesce(provider_output,'{}'::jsonb) ELSE '{}'::jsonb END,
      accepted_media_asset_id,
      CASE WHEN status::text IN ('queued','processing') THEN 'Interrupted by workflow upgrade. Saved outputs are kept; review them before starting again.' ELSE error END,
      created_by,created_at,updated_at,coalesce(completed_at,now()),now()
      FROM creative_run ON CONFLICT (id) DO NOTHING`);
    await tx.unsafe(`INSERT INTO catalog_export (id,organization_id,brand_id,source_run_id,input,output,created_by,created_at)
      SELECT id,organization_id,brand_id,id,input,provider_output,created_by,created_at
      FROM creative_run WHERE provider='catalog-export' AND status::text='ready'
      ON CONFLICT (id) DO NOTHING`);
    const [counts] = await tx`select
      (select count(*)::int from creative_run where provider='catalog-export' and status::text='ready') as source,
      (select count(*)::int from catalog_export) as preserved`;
    if (!counts || counts.preserved < counts.source)
      throw new Error("Export preservation failed");
    console.log("Catalog export preservation verified", counts);
  });
  console.log(
    "Workflow schema and preserved results committed; legacy table retained for the running release.",
  );
} finally {
  await sql.end();
}
