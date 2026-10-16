ALTER TABLE "platform_audience" ADD COLUMN "for_brand_id" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "seed_member" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "platform_audience" ADD CONSTRAINT "platform_audience_for_brand_id_brand_id_fk" FOREIGN KEY ("for_brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;