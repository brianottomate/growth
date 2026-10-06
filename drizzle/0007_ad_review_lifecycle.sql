ALTER TYPE "public"."ad_status" ADD VALUE 'ready';--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "ready_at" timestamp;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "ready_by" text;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "replaces_ad_id" text;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_ready_by_user_id_fk" FOREIGN KEY ("ready_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_replaces_ad_id_ad_id_fk" FOREIGN KEY ("replaces_ad_id") REFERENCES "public"."ad"("id") ON DELETE set null ON UPDATE no action;