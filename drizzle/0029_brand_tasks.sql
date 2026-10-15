CREATE TABLE "brand_task" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"template_key" text,
	"title" text NOT NULL,
	"notes" text,
	"category" text DEFAULT 'setup' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"sort_order" integer NOT NULL,
	"created_by_user_id" text,
	"assignee_user_id" text,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "brand_task" ADD CONSTRAINT "brand_task_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_task" ADD CONSTRAINT "brand_task_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_task" ADD CONSTRAINT "brand_task_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_task" ADD CONSTRAINT "brand_task_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_task_brand_idx" ON "brand_task" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_task_assignee_idx" ON "brand_task" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_task_template_idx" ON "brand_task" USING btree ("brand_id","template_key");
--> statement-breakpoint
-- Snapshot of the TypeScript default template at migration time. Existing JSON
-- status fields become archival; onboarding milestones and commercial values stay.
WITH template(key, title, category, tags, position) AS (
  VALUES
    ('metaConnected', 'Connect Facebook / Meta', 'ads_infrastructure', ARRAY['meta', 'ad account', 'client access']::text[], 0),
    ('googleAdsAccount', 'Set up Google Ads account', 'ads_infrastructure', ARRAY['google', 'ad account']::text[], 1),
    ('googleBilling', 'Set up Google billing', 'billing', ARRAY['google', 'billing']::text[], 2),
    ('catalogCreative', 'Prepare catalog ad creative', 'creative', ARRAY['catalog', 'creative', 'ads']::text[], 3),
    ('carouselCreative', 'Prepare carousel creative', 'creative', ARRAY['creative', 'ads']::text[], 4),
    ('heroCreative', 'Prepare hero creative', 'creative', ARRAY['creative', 'ads']::text[], 5),
    ('adCopy', 'Write ad copy', 'creative', ARRAY['copy', 'ads']::text[], 6),
    ('adsLive', 'Review ads launch', 'setup', ARRAY['ads']::text[], 7),
    ('newsletter', 'Plan Wander newsletter', 'marketing', ARRAY['email']::text[], 8),
    ('influencer', 'Coordinate influencer marketing', 'marketing', ARRAY[]::text[], 9),
    ('socialPosts', 'Prepare social media posts', 'marketing', ARRAY['creative', 'copy']::text[], 10)
)
INSERT INTO brand_task (
  id, brand_id, template_key, title, category, tags, status, sort_order,
  completed_at, completed_by_user_id, created_at, updated_at
)
SELECT
  'btask_' || md5(b.id || ':' || template.key), b.id, template.key,
  template.title, template.category, template.tags,
  CASE b.performance_checklist -> 'values' ->> template.key
    WHEN 'yes' THEN 'done' WHEN 'in_progress' THEN 'in_progress' ELSE 'todo' END,
  template.position,
  CASE WHEN b.performance_checklist -> 'values' ->> template.key = 'yes'
    THEN coalesce((b.performance_checklist -> 'meta' -> template.key ->> 'at')::timestamptz, b.updated_at) END,
  CASE WHEN b.performance_checklist -> 'values' ->> template.key = 'yes' THEN actor.id END,
  b.created_at, coalesce((b.performance_checklist -> 'meta' -> template.key ->> 'at')::timestamptz, b.updated_at)
FROM brand b CROSS JOIN template
LEFT JOIN "user" actor ON actor.id = b.performance_checklist -> 'meta' -> template.key ->> 'by'
WHERE b.deleted_at IS NULL AND b.organization_id IS NOT NULL
  AND (b.relationship = 'client' OR coalesce(b.performance_checklist -> 'values', '{}'::jsonb) ?| ARRAY['metaConnected', 'googleAdsAccount', 'googleBilling', 'catalogCreative', 'carouselCreative', 'heroCreative', 'adCopy', 'adsLive', 'newsletter', 'influencer', 'socialPosts']);
