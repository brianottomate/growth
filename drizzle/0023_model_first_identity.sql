DROP INDEX "media_asset_discovered_source_idx";--> statement-breakpoint
ALTER TABLE "platform_campaign" ADD COLUMN "performance_cycle_id" text;--> statement-breakpoint
ALTER TABLE "performance_cycle" ADD COLUMN "fee_invoice_state" text;--> statement-breakpoint
ALTER TABLE "performance_cycle" ADD COLUMN "media_invoice_state" text;--> statement-breakpoint
ALTER TABLE "home" ADD COLUMN "carousel" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_campaign" ADD CONSTRAINT "platform_campaign_performance_cycle_id_performance_cycle_id_fk" FOREIGN KEY ("performance_cycle_id") REFERENCES "public"."performance_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Canonical source provenance; imports remain distinct assets when requested.
UPDATE media_asset SET discovered_source_url = metadata->>'sourceUrl'
WHERE discovered_source_url IS NULL AND jsonb_typeof(metadata->'sourceUrl') = 'string';
--> statement-breakpoint
UPDATE media_asset SET metadata = metadata - 'sourceUrl' WHERE metadata ? 'sourceUrl';
--> statement-breakpoint
-- Preserve the stored carousel sequence before retiring placement-on-photo state.
UPDATE home h SET carousel = photos.items
FROM (SELECT home_id, jsonb_agg(jsonb_build_object('assetId', asset_id, 'sourceUrl', source_url, 'thumbUrl', thumb_url) ORDER BY sort_order NULLS LAST, created_at, id) AS items
      FROM home_media WHERE role = 'carousel' GROUP BY home_id) photos
WHERE h.id = photos.home_id;
--> statement-breakpoint
UPDATE home_media SET role = 'gallery', sort_order = NULL WHERE role = 'carousel';
--> statement-breakpoint
-- Each platform delivery owns its report membership, independently of plan grouping.
UPDATE platform_campaign pc SET performance_cycle_id = c.performance_cycle_id
FROM campaign c WHERE pc.campaign_id = c.id;
--> statement-breakpoint
UPDATE platform_campaign pc SET campaign_id = NULL FROM campaign c
WHERE pc.campaign_id = c.id AND c.slug = 'perf-cycle-' || c.performance_cycle_id
AND c.description LIKE 'Wrapper campaign created by attaching a platform campaign%';
--> statement-breakpoint
UPDATE campaign SET status = 'archived', performance_cycle_id = NULL
WHERE slug = 'perf-cycle-' || performance_cycle_id
AND description LIKE 'Wrapper campaign created by attaching a platform campaign%';
--> statement-breakpoint
-- Current cycle records are authoritative for Paid; carry non-payment workflow
-- states onto the explicitly selected month without overwriting payment receipts.
UPDATE performance_cycle cy SET
 fee_paid_at = CASE WHEN cy.fee_paid_at IS NULL AND b.performance_settings->'cardState'->>'managementPayment' = 'Paid' THEN b.updated_at ELSE cy.fee_paid_at END,
 media_paid_at = CASE WHEN cy.media_paid_at IS NULL AND b.performance_settings->'cardState'->>'spendPayment' = 'Paid' THEN b.updated_at ELSE cy.media_paid_at END,
 fee_invoice_state = CASE WHEN cy.fee_paid_at IS NOT NULL THEN NULL ELSE CASE WHEN b.performance_settings->'cardState'->>'managementPayment' IN ('Open','Not invoiced') THEN b.performance_settings->'cardState'->>'managementPayment' ELSE NULL END END,
 media_invoice_state = CASE WHEN cy.media_paid_at IS NOT NULL THEN NULL ELSE CASE WHEN b.performance_settings->'cardState'->>'spendPayment' IN ('Open','Not invoiced') THEN b.performance_settings->'cardState'->>'spendPayment' ELSE NULL END END
FROM performance_account a JOIN brand b ON b.id=a.brand_id
WHERE cy.account_id=a.id AND cy.period=coalesce(b.performance_settings->'cardState'->>'billingPeriod',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'));
--> statement-breakpoint
UPDATE brand SET performance_settings = jsonb_set(performance_settings, '{cardState}', (performance_settings->'cardState') - 'managementPayment' - 'spendPayment')
WHERE jsonb_typeof(performance_settings->'cardState') = 'object';
--> statement-breakpoint
-- Reconcile duplicate identities by the established last-write-wins policy.
DELETE FROM cadence_target WHERE id IN (
 SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY channel_id, archetype, template, series_id, period, deleted_at ORDER BY updated_at DESC, created_at DESC, id DESC) AS n FROM cadence_target) ranked WHERE n > 1
);

--> statement-breakpoint
CREATE INDEX "media_asset_source_url_idx" ON "media_asset" USING btree ("brand_id","discovered_source_url");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_discovered_source_idx" ON "media_asset" USING btree ("brand_id","discovered_source_url") WHERE "media_asset"."source_provider" = 'website';--> statement-breakpoint
ALTER TABLE "cadence_target" ADD CONSTRAINT "cadence_target_identity" UNIQUE NULLS NOT DISTINCT("channel_id","archetype","template","series_id","period","deleted_at");