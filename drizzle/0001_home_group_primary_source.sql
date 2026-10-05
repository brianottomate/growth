CREATE TYPE "public"."home_group_source" AS ENUM('suggested', 'intake', 'manual');--> statement-breakpoint
ALTER TABLE "home_group" ADD COLUMN "source" "home_group_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "home_group" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "home_group_primary_unique" ON "home_group" USING btree ("brand_id") WHERE "home_group"."is_primary";