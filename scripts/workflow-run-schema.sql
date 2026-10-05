-- Generated from the Drizzle schema. Additive cutover before application deployment.
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');
--> statement-breakpoint
CREATE TABLE "catalog_export" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"source_run_id" text,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "catalog_export_sourceRunId_unique" UNIQUE("source_run_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"content_post_id" text,
	"thread_id" text,
	"packet_id" text,
	"workflow_type" text NOT NULL,
	"campaign_id" text,
	"workflow_version" integer DEFAULT 1 NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_run_id" text,
	"retry_of_id" text,
	"lock_key" text,
	"claim_token" uuid,
	"started_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"provider" text DEFAULT 'internal' NOT NULL,
	"kind" text,
	"model" text DEFAULT '' NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"input" jsonb NOT NULL,
	"operation" text DEFAULT 'generate' NOT NULL,
	"expires_at" timestamp with time zone,
	"result" jsonb,
	"provider_request_id" text,
	"webhook_token_hash" text,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_output" jsonb,
	"accepted_media_asset_id" text,
	"error" text,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_source_run_id_workflow_run_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_packet_id_production_packet_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."production_packet"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_accepted_media_asset_id_media_asset_id_fk" FOREIGN KEY ("accepted_media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_parent_run_id_workflow_run_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_retry_of_id_workflow_run_id_fk" FOREIGN KEY ("retry_of_id") REFERENCES "public"."workflow_run"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "catalog_export_brand_idx" ON "catalog_export" USING btree ("brand_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_active_packet_idx" ON "workflow_run" USING btree ("packet_id") WHERE "workflow_run"."packet_id" IS NOT NULL AND "workflow_run"."status" IN ('queued', 'running');
--> statement-breakpoint
CREATE INDEX "workflow_run_brand_idx" ON "workflow_run" USING btree ("brand_id","created_at");
--> statement-breakpoint
CREATE INDEX "workflow_run_queue_idx" ON "workflow_run" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_active_resource_idx" ON "workflow_run" USING btree ("organization_id","lock_key") WHERE "workflow_run"."lock_key" IS NOT NULL AND "workflow_run"."status" IN ('queued', 'running');
--> statement-breakpoint
CREATE INDEX "workflow_run_packet_idx" ON "workflow_run" USING btree ("packet_id");
--> statement-breakpoint
CREATE INDEX "workflow_run_thread_idx" ON "workflow_run" USING btree ("thread_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_provider_request_idx" ON "workflow_run" USING btree ("provider","provider_request_id");
