CREATE SCHEMA "email";
--> statement-breakpoint
CREATE TABLE "email"."list_member" (
	"list_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"source_id" text,
	"sample_rank" text NOT NULL,
	CONSTRAINT "list_member_list_id_email_pk" PRIMARY KEY("list_id","email")
);
--> statement-breakpoint
CREATE TABLE "email"."list" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"file_name" text,
	"member_count" integer NOT NULL,
	"invalid_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"names_cleared" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_audience_snapshot" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_audience_snapshot" ALTER COLUMN "table_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email"."list_member" ADD CONSTRAINT "list_member_list_id_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "email"."list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email"."list" ADD CONSTRAINT "list_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_list_member_rank_idx" ON "email"."list_member" USING btree ("list_id","sample_rank","email");