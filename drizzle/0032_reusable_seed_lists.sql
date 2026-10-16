CREATE TABLE "seed_list" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seed_member" (
	"snapshot_id" text NOT NULL,
	"email_hash" text NOT NULL,
	"score" integer NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "seed_member_snapshot_id_email_hash_pk" PRIMARY KEY("snapshot_id","email_hash")
);
--> statement-breakpoint
CREATE TABLE "seed_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"seed_list_id" text NOT NULL,
	"definition" jsonb NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"member_count" integer NOT NULL,
	"diagnostics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_audience" ADD COLUMN "seed_snapshot_id" text;--> statement-breakpoint
ALTER TABLE "platform_audience" ADD COLUMN "parent_platform_audience_id" text;--> statement-breakpoint
ALTER TABLE "seed_list" ADD CONSTRAINT "seed_list_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_member" ADD CONSTRAINT "seed_member_snapshot_id_seed_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."seed_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_snapshot" ADD CONSTRAINT "seed_snapshot_seed_list_id_seed_list_id_fk" FOREIGN KEY ("seed_list_id") REFERENCES "public"."seed_list"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seed_list_brand_idx" ON "seed_list" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "seed_snapshot_list_idx" ON "seed_snapshot" USING btree ("seed_list_id","created_at");--> statement-breakpoint
ALTER TABLE "platform_audience" ADD CONSTRAINT "platform_audience_seed_snapshot_id_seed_snapshot_id_fk" FOREIGN KEY ("seed_snapshot_id") REFERENCES "public"."seed_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audience" ADD CONSTRAINT "platform_audience_parent_platform_audience_id_platform_audience_id_fk" FOREIGN KEY ("parent_platform_audience_id") REFERENCES "public"."platform_audience"("id") ON DELETE restrict ON UPDATE no action;