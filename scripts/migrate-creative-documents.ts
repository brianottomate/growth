import { creativeDocumentSchema } from "../src/lib/creative-document";

export type CreativeMigrationConnection = {
  unsafe: (query: string) => PromiseLike<unknown>;
};
/** Run in one transaction. The default is additive, so the currently deployed app keeps working. */
export async function migrateCreativeDocuments(
  tx: CreativeMigrationConnection,
  retireLegacy = false,
) {
  await tx.unsafe(
    `ALTER TABLE production_packet ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'image', ADD COLUMN IF NOT EXISTS document jsonb`,
  );
  await tx.unsafe(
    `ALTER TABLE creative_run ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'generate', ADD COLUMN IF NOT EXISTS expires_at timestamptz, ADD COLUMN IF NOT EXISTS result jsonb`,
  );
  await tx.unsafe(
    `CREATE TABLE IF NOT EXISTS platform_document (platform_post_id text PRIMARY KEY REFERENCES platform_post(id) ON DELETE CASCADE, document_id text NOT NULL REFERENCES production_packet(id) ON DELETE CASCADE)`,
  );
  await tx.unsafe(
    `UPDATE production_packet SET document = jsonb_build_object('schemaVersion', 1, 'type', 'image', 'brief', jsonb_build_object('purpose', coalesce(purpose,''), 'audience','', 'direction',prompt, 'facts','[]'::jsonb, 'constraints',CASE WHEN instructions IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(instructions) END, 'cta','', 'assets',coalesce((SELECT jsonb_agg(jsonb_build_object('assetId',r->>'mediaAssetId','role','reference')) FROM jsonb_array_elements("references") r WHERE r->>'mediaAssetId' IS NOT NULL),'[]'::jsonb)), 'content',jsonb_build_object('composition',prompt,'overlayCopy','','avoid',coalesce(negative_prompt,''),'aspectRatio',coalesce(aspect_ratio,'1:1'),'outputFormat',CASE WHEN output_format IN ('png','jpeg','webp') THEN output_format ELSE 'png' END,'mode','generate')) WHERE document IS NULL`,
  );
  const legacy = (await tx.unsafe(
    `SELECT to_regclass('public.email_document') IS NOT NULL AS exists`,
  )) as { exists: boolean }[];
  if (legacy[0]?.exists) {
    const active = (await tx.unsafe(
      `SELECT count(*)::int AS count FROM email_generation_job WHERE status IN ('queued','running')`,
    )) as { count: number }[];
    if (active[0]?.count)
      throw new Error(
        "Wait for existing email generation to finish before cutover.",
      );
    await tx.unsafe(`INSERT INTO production_packet (id,organization_id,brand_id,content_post_id,title,document_type,document,prompt,status,created_by,created_at,updated_at)
      SELECT 'pkt_' || e.id,b.organization_id,p.brand_id,p.content_post_id,coalesce(nullif(e.subject,''),'Email draft'),'email',
      jsonb_build_object('schemaVersion',1,'type','email','brief',jsonb_build_object('purpose',coalesce(c.title,''),'audience','','direction',coalesce(c.body,''),'facts','[]'::jsonb,'constraints','[]'::jsonb,'cta',coalesce(c.cta_text,''),'assets','[]'::jsonb),
      'content',jsonb_build_object('subject',e.subject,'preheader',e.preheader,'bodyMarkdown',e.body_markdown,'ctaLabel',e.cta_label,'ctaUrl',e.cta_url,'templateKey',e.template_key,'handoffTargetRepo',e.handoff_target_repo,'productUpdate',e.product_update,'digest',e.digest)),
      coalesce(c.body,''),'draft',e.created_by,e.created_at,e.updated_at FROM email_document e JOIN platform_post p ON p.id=e.platform_post_id JOIN brand b ON b.id=p.brand_id LEFT JOIN content_post c ON c.id=p.content_post_id
      ON CONFLICT (id) DO UPDATE SET document=EXCLUDED.document, updated_at=EXCLUDED.updated_at WHERE production_packet.updated_at < EXCLUDED.updated_at`);
    await tx.unsafe(
      `INSERT INTO platform_document (platform_post_id,document_id) SELECT e.platform_post_id,'pkt_' || e.id FROM email_document e JOIN production_packet p ON p.id='pkt_' || e.id ON CONFLICT DO NOTHING`,
    );
    const missing = (await tx.unsafe(
      `SELECT count(*)::int AS count FROM email_document e LEFT JOIN production_packet p ON p.id='pkt_' || e.id WHERE p.id IS NULL`,
    )) as { count: number }[];
    if (missing[0]?.count)
      throw new Error("Email migration would lose drafts.");
  }
  const rows = (await tx.unsafe(
    `SELECT id, document FROM production_packet`,
  )) as { id: string; document: unknown }[];
  for (const row of rows) {
    const parsed = creativeDocumentSchema.safeParse(row.document);
    if (!parsed.success)
      throw new Error(`Invalid document ${row.id}: ${parsed.error.message}`);
  }
  await tx.unsafe(
    `UPDATE creative_run SET expires_at=now()+interval '20 minutes' WHERE packet_id IS NOT NULL AND status IN ('queued','processing') AND expires_at IS NULL`,
  );
  await tx.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS creative_run_active_packet_idx ON creative_run(packet_id) WHERE packet_id IS NOT NULL AND status IN ('queued','processing')`,
  );
  await tx.unsafe(
    `CREATE INDEX IF NOT EXISTS platform_document_document_idx ON platform_document(document_id)`,
  );
  await tx.unsafe(
    `ALTER TABLE message_send ADD COLUMN IF NOT EXISTS document_id text REFERENCES production_packet(id), ADD COLUMN IF NOT EXISTS content_hash text`,
  );
  if (retireLegacy) {
    // The live audit found no sends. Refuse to discard a send if that changes before deployment.
    const sends = (await tx.unsafe(
      `SELECT count(*)::int AS count FROM message_send WHERE document_id IS NULL OR content_hash IS NULL`,
    )) as { count: number }[];
    if (sends[0]?.count)
      throw new Error(
        "Legacy email delivery records need an explicit snapshot migration.",
      );
    await tx.unsafe(
      `ALTER TABLE message_send DROP COLUMN IF EXISTS email_document_version_id, DROP COLUMN IF EXISTS email_document_id, DROP COLUMN IF EXISTS revision`,
    );
    await tx.unsafe(
      `ALTER TABLE message_send ALTER COLUMN document_id SET NOT NULL, ALTER COLUMN content_hash SET NOT NULL`,
    );
    await tx.unsafe(
      `DROP TABLE IF EXISTS email_generation_job, email_document_version, email_document`,
    );
    await tx.unsafe(
      `DROP TYPE IF EXISTS email_generation_status, email_document_version_source`,
    );
    await tx.unsafe(
      `ALTER TABLE production_packet ALTER COLUMN document SET NOT NULL`,
    );
    await tx.unsafe(
      `ALTER TABLE production_packet DROP CONSTRAINT IF EXISTS production_packet_document_type_check`,
    );
    await tx.unsafe(
      `ALTER TABLE production_packet ADD CONSTRAINT production_packet_document_type_check CHECK (document_type IN ('article','email','image','video') AND document @> jsonb_build_object('type',document_type,'schemaVersion',1))`,
    );
  }
  return {
    documents: rows.length,
    legacyEmailsCopied: legacy[0]?.exists ?? false,
    retired: retireLegacy,
  };
}
