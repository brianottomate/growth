CREATE TABLE "home_group_interest" (
	"group_id" text NOT NULL,
	"home_id" text NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_group_interest_group_id_home_id_pk" PRIMARY KEY("group_id","home_id")
);
--> statement-breakpoint
CREATE TABLE "home_group_share" (
	"group_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"recipient_amplifier_id" text,
	"response_revision" integer DEFAULT 0 NOT NULL,
	"response_note" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone,
	"share_token" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_group_share_response_revision_check" CHECK ("home_group_share"."response_revision" >= 0),
	CONSTRAINT "home_group_share_note_check" CHECK (char_length("home_group_share"."response_note") <= 2000),
	CONSTRAINT "home_group_share_title_check" CHECK (char_length(btrim("home_group_share"."title")) between 1 and 120),
	CONSTRAINT "home_group_share_token_check" CHECK ("home_group_share"."share_token" is null or "home_group_share"."share_token" ~ '^[A-Za-z0-9_-]{43}$')
);
--> statement-breakpoint
ALTER TABLE "home_group" ALTER COLUMN "brand_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "amplifier" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "amplifier" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "home_group" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "home_group" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "home_group_interest" ADD CONSTRAINT "home_group_interest_group_id_home_id_home_group_member_group_id_home_id_fk" FOREIGN KEY ("group_id","home_id") REFERENCES "public"."home_group_member"("group_id","home_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_group_share" ADD CONSTRAINT "home_group_share_group_id_home_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."home_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_group_share" ADD CONSTRAINT "home_group_share_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_group_share" ADD CONSTRAINT "home_group_share_recipient_amplifier_id_amplifier_id_fk" FOREIGN KEY ("recipient_amplifier_id") REFERENCES "public"."amplifier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_group_share" ADD CONSTRAINT "home_group_share_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_group_share_recipient_idx" ON "home_group_share" USING btree ("recipient_amplifier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_group_share_token_unique" ON "home_group_share" USING btree ("share_token");--> statement-breakpoint
ALTER TABLE "home_group" ADD CONSTRAINT "home_group_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_group_org_idx" ON "home_group" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "home_group" ADD CONSTRAINT "home_group_owner_check" CHECK (("home_group"."brand_id" is not null and "home_group"."organization_id" is null) or ("home_group"."brand_id" is null and "home_group"."organization_id" is not null));--> statement-breakpoint
ALTER TABLE "home_group" ADD CONSTRAINT "home_group_primary_owner_check" CHECK (not "home_group"."is_primary" or "home_group"."brand_id" is not null);--> statement-breakpoint
ALTER TABLE "home_group" ADD CONSTRAINT "home_group_revision_check" CHECK ("home_group"."revision" >= 0);