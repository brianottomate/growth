-- A seed list holds its one build. Existing lists are purged and rebuilt;
-- Meta keeps whatever was uploaded, and local assets lose only the lineage.
ALTER TABLE "platform_audience" DROP CONSTRAINT "platform_audience_seed_snapshot_id_seed_snapshot_id_fk";--> statement-breakpoint
ALTER TABLE "platform_audience" DROP COLUMN "seed_snapshot_id";--> statement-breakpoint
DROP TABLE "seed_member";--> statement-breakpoint
DROP TABLE "seed_snapshot";--> statement-breakpoint
DELETE FROM "seed_list";--> statement-breakpoint
ALTER TABLE "seed_list" ADD COLUMN "definition" jsonb;--> statement-breakpoint
ALTER TABLE "seed_list" ADD COLUMN "members" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "seed_list" ADD COLUMN "member_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "seed_list" ADD COLUMN "summary" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "seed_list" ADD COLUMN "built_at" timestamp with time zone NOT NULL;
