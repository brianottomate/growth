ALTER TABLE "audience" ADD COLUMN "age_min" integer;--> statement-breakpoint
ALTER TABLE "audience" ADD COLUMN "age_max" integer;--> statement-breakpoint
ALTER TABLE "audience" ADD CONSTRAINT "audience_age_min_valid" CHECK ("audience"."age_min" IS NULL OR "audience"."age_min" BETWEEN 0 AND 120);--> statement-breakpoint
ALTER TABLE "audience" ADD CONSTRAINT "audience_age_max_valid" CHECK ("audience"."age_max" IS NULL OR "audience"."age_max" BETWEEN 0 AND 120);--> statement-breakpoint
ALTER TABLE "audience" ADD CONSTRAINT "audience_age_order_valid" CHECK ("audience"."age_min" IS NULL OR "audience"."age_max" IS NULL OR "audience"."age_min" <= "audience"."age_max");