CREATE TABLE "content_workbook_result" (
	"id" text PRIMARY KEY NOT NULL,
	"workbook_id" text NOT NULL,
	"source_row" integer NOT NULL,
	"content_post_id" text,
	"platform_post_id" text
);
--> statement-breakpoint
CREATE TABLE "content_workbook" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"source" jsonb NOT NULL,
	"document" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"created_by" text,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_workbook_result" ADD CONSTRAINT "content_workbook_result_workbook_id_content_workbook_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."content_workbook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_workbook_result" ADD CONSTRAINT "content_workbook_result_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_workbook_result" ADD CONSTRAINT "content_workbook_result_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_workbook" ADD CONSTRAINT "content_workbook_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_workbook" ADD CONSTRAINT "content_workbook_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_workbook_result_row_unique" ON "content_workbook_result" USING btree ("workbook_id","source_row");--> statement-breakpoint
CREATE INDEX "content_workbook_brand_idx" ON "content_workbook" USING btree ("brand_id");