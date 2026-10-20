CREATE TABLE "influencer_partnership" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"amplifier_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"home_id" text,
	"check_in" date,
	"check_out" date,
	"deliverables" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "influencer_partnership_dates_check" CHECK (("influencer_partnership"."check_in" is null and "influencer_partnership"."check_out" is null) or ("influencer_partnership"."check_in" is not null and "influencer_partnership"."check_out" is not null and "influencer_partnership"."check_out" > "influencer_partnership"."check_in"))
);
--> statement-breakpoint
ALTER TABLE "home_group_interest" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "home_group_interest" CASCADE;--> statement-breakpoint
ALTER TABLE "home_group_share" DROP CONSTRAINT "home_group_share_response_revision_check";--> statement-breakpoint
ALTER TABLE "home_group_share" DROP CONSTRAINT "home_group_share_note_check";--> statement-breakpoint
ALTER TABLE "home_group_share" DROP CONSTRAINT "home_group_share_recipient_amplifier_id_amplifier_id_fk";
--> statement-breakpoint
DROP INDEX "home_group_share_recipient_idx";--> statement-breakpoint
ALTER TABLE "influencer_partnership" ADD CONSTRAINT "influencer_partnership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_partnership" ADD CONSTRAINT "influencer_partnership_amplifier_id_amplifier_id_fk" FOREIGN KEY ("amplifier_id") REFERENCES "public"."amplifier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_partnership" ADD CONSTRAINT "influencer_partnership_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_partnership" ADD CONSTRAINT "influencer_partnership_home_id_home_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."home"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "influencer_partnership_org_idx" ON "influencer_partnership" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "influencer_partnership_amplifier_idx" ON "influencer_partnership" USING btree ("amplifier_id");--> statement-breakpoint
CREATE INDEX "influencer_partnership_brand_idx" ON "influencer_partnership" USING btree ("brand_id");--> statement-breakpoint
ALTER TABLE "home_group_share" DROP COLUMN "recipient_amplifier_id";--> statement-breakpoint
ALTER TABLE "home_group_share" DROP COLUMN "response_revision";--> statement-breakpoint
ALTER TABLE "home_group_share" DROP COLUMN "response_note";--> statement-breakpoint
ALTER TABLE "home_group_share" DROP COLUMN "submitted_at";