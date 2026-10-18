CREATE TABLE "board_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"document" jsonb NOT NULL,
	"content_post_id" text,
	"ad_id" text,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_proposal_one_draft" CHECK (num_nonnulls("board_proposal"."content_post_id", "board_proposal"."ad_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "board_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"platform_post_id" text,
	"media_asset_id" text,
	"note" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "board_reference_one_source" CHECK (num_nonnulls("board_reference"."platform_post_id", "board_reference"."media_asset_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "reference_board" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_proposal" ADD CONSTRAINT "board_proposal_board_id_reference_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."reference_board"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_proposal" ADD CONSTRAINT "board_proposal_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_proposal" ADD CONSTRAINT "board_proposal_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reference" ADD CONSTRAINT "board_reference_board_id_reference_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."reference_board"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reference" ADD CONSTRAINT "board_reference_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reference" ADD CONSTRAINT "board_reference_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_board" ADD CONSTRAINT "reference_board_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_board" ADD CONSTRAINT "reference_board_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_proposal_board_idx" ON "board_proposal" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "board_reference_board_idx" ON "board_reference" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "reference_board_org_brand_idx" ON "reference_board" USING btree ("organization_id","brand_id");