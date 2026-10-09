ALTER TABLE "platform_ad_set" RENAME TO "platform_delivery_group";--> statement-breakpoint
ALTER TABLE "platform_ad" RENAME COLUMN "platform_ad_set_id" TO "platform_delivery_group_id";--> statement-breakpoint
ALTER TABLE "platform_delivery_group" DROP CONSTRAINT "platform_ad_set_platform_campaign_id_platform_campaign_id_fk";
--> statement-breakpoint
ALTER TABLE "platform_delivery_group" DROP CONSTRAINT "platform_ad_set_brand_id_brand_id_fk";
--> statement-breakpoint
ALTER TABLE "platform_delivery_group" DROP CONSTRAINT "platform_ad_set_audience_id_audience_id_fk";
--> statement-breakpoint
ALTER TABLE "platform_ad" DROP CONSTRAINT "platform_ad_platform_ad_set_id_platform_ad_set_id_fk";
--> statement-breakpoint
DROP INDEX "platform_ad_set_campaign_idx";--> statement-breakpoint
DROP INDEX "platform_ad_set_audience_idx";--> statement-breakpoint
DROP INDEX "platform_ad_set_external_id_idx";--> statement-breakpoint
DROP INDEX "platform_ad_set_idx";--> statement-breakpoint
ALTER TABLE "platform_delivery_group" ADD COLUMN "configuration" jsonb;--> statement-breakpoint
ALTER TABLE "platform_delivery_group" ADD CONSTRAINT "platform_delivery_group_platform_campaign_id_platform_campaign_id_fk" FOREIGN KEY ("platform_campaign_id") REFERENCES "public"."platform_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_delivery_group" ADD CONSTRAINT "platform_delivery_group_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_delivery_group" ADD CONSTRAINT "platform_delivery_group_audience_id_audience_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audience"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad" ADD CONSTRAINT "platform_ad_platform_delivery_group_id_platform_delivery_group_id_fk" FOREIGN KEY ("platform_delivery_group_id") REFERENCES "public"."platform_delivery_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_delivery_group_campaign_idx" ON "platform_delivery_group" USING btree ("platform_campaign_id");--> statement-breakpoint
CREATE INDEX "platform_delivery_group_audience_idx" ON "platform_delivery_group" USING btree ("audience_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_delivery_group_external_id_idx" ON "platform_delivery_group" USING btree ("external_id") WHERE "platform_delivery_group"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_delivery_group_idx" ON "platform_ad" USING btree ("platform_delivery_group_id");--> statement-breakpoint
-- Carry executable settings into unpublished platform plans before removing intent-layer columns.
-- Native provider snapshots and external identities are untouched.
UPDATE "platform_campaign" p SET "settings" = jsonb_set(COALESCE(p.settings, '{}'::jsonb), '{google}',
  COALESCE(p.settings->'google', '{}'::jsonb) || jsonb_build_object('geography', a.geography))
FROM (SELECT campaign_id, min(geography::text)::jsonb AS geography FROM audience
  WHERE geography IS NOT NULL AND geography <> '{}'::jsonb GROUP BY campaign_id
  HAVING count(DISTINCT geography::text) = 1) a
WHERE p.campaign_id = a.campaign_id AND p.platform = 'google_ads' AND p.external_id IS NULL
  AND p.settings->'google'->'geography' IS NULL;
--> statement-breakpoint
INSERT INTO "platform_delivery_group" (id, platform_campaign_id, brand_id, audience_id, name, status, configuration, created_at, updated_at)
SELECT 'pdg_' || md5(p.id || ':' || a.id), p.id, p.brand_id, a.id, a.name, 'draft',
  CASE WHEN p.platform = 'google_ads' THEN jsonb_build_object('platform', p.platform, 'keywords', COALESCE(a.keywords, '[]'::jsonb), 'excludedKeywords', COALESCE(a.excluded_keywords, '[]'::jsonb))
    WHEN p.platform IN ('meta_ads', 'linkedin_ads') THEN jsonb_build_object('platform', p.platform, 'targeting', jsonb_strip_nulls(jsonb_build_object('geography', a.geography, 'ageMin', a.age_min, 'ageMax', a.age_max)))
    ELSE jsonb_build_object('platform', p.platform) END, now(), now()
FROM platform_campaign p JOIN audience a ON a.campaign_id = p.campaign_id AND a.brand_id = p.brand_id
WHERE p.external_id IS NULL AND NOT EXISTS (SELECT 1 FROM platform_delivery_group g WHERE g.platform_campaign_id = p.id AND g.audience_id = a.id);
--> statement-breakpoint
UPDATE platform_delivery_group g SET configuration = CASE
  WHEN p.platform = 'google_ads' THEN jsonb_build_object('platform', p.platform, 'keywords', COALESCE(a.keywords, '[]'::jsonb), 'excludedKeywords', COALESCE(a.excluded_keywords, '[]'::jsonb))
  WHEN p.platform IN ('meta_ads', 'linkedin_ads') THEN jsonb_build_object('platform', p.platform, 'targeting', jsonb_strip_nulls(jsonb_build_object('geography', a.geography, 'ageMin', a.age_min, 'ageMax', a.age_max)))
  ELSE jsonb_build_object('platform', p.platform) END
FROM platform_campaign p, audience a WHERE g.platform_campaign_id = p.id AND g.audience_id = a.id AND p.external_id IS NULL AND g.configuration IS NULL;
--> statement-breakpoint
INSERT INTO platform_delivery_group (id, platform_campaign_id, brand_id, audience_id, name, status, configuration, created_at, updated_at)
SELECT 'pdg_' || md5(p.id || ':broad'), p.id, p.brand_id, NULL, 'Broad', 'draft', jsonb_build_object('platform', p.platform), now(), now()
FROM platform_campaign p WHERE p.external_id IS NULL AND NOT EXISTS (SELECT 1 FROM platform_delivery_group g WHERE g.platform_campaign_id = p.id);
--> statement-breakpoint
UPDATE persona SET profile = profile - 'homeIds' - 'fitReason' - 'travel' WHERE profile IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "persona" DROP COLUMN "demand_geography";--> statement-breakpoint
ALTER TABLE "persona" DROP COLUMN "destination_geography";--> statement-breakpoint
ALTER TABLE "audience" DROP COLUMN "age_min";--> statement-breakpoint
ALTER TABLE "audience" DROP COLUMN "age_max";--> statement-breakpoint
ALTER TABLE "audience" DROP COLUMN "home_ids";--> statement-breakpoint
ALTER TABLE "audience" DROP COLUMN "geography";--> statement-breakpoint
ALTER TABLE "audience" DROP COLUMN "keywords";--> statement-breakpoint
ALTER TABLE "audience" DROP COLUMN "excluded_keywords";--> statement-breakpoint
ALTER TABLE "audience" DROP COLUMN "optimization_goal";