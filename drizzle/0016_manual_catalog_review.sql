ALTER TABLE "home" ADD COLUMN "catalog_ready_at" timestamp;--> statement-breakpoint
ALTER TABLE "home" ADD COLUMN "catalog_ready_by" text;--> statement-breakpoint
ALTER TABLE "home" ADD CONSTRAINT "home_catalog_ready_by_user_id_fk" FOREIGN KEY ("catalog_ready_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Approval is a human state; remove the retired content fingerprint.
UPDATE "home" SET "catalog_approval" = "catalog_approval" - 'fingerprint' WHERE "catalog_approval" ? 'fingerprint';
