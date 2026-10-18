CREATE TABLE "article_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"run_id" text,
	"document" jsonb NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'history' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp,
	CONSTRAINT "article_revision_status_check" CHECK ("article_revision"."status" IN ('history','candidate','accepted','dismissed')),
	CONSTRAINT "article_revision_type_check" CHECK ("article_revision"."document" @> '{"type":"article","schemaVersion":1}'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "article_revision" ADD CONSTRAINT "article_revision_document_id_production_packet_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."production_packet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revision" ADD CONSTRAINT "article_revision_run_id_workflow_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revision" ADD CONSTRAINT "article_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revision" ADD CONSTRAINT "article_revision_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_revision_document_idx" ON "article_revision" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "article_revision_run_unique" ON "article_revision" USING btree ("run_id");
--> statement-breakpoint
INSERT INTO "article_revision" ("id", "document_id", "document", "source", "status", "created_by")
SELECT 'arev_baseline_' || md5("id"), "id", "document", 'baseline', 'history', "created_by"
FROM "production_packet" WHERE "document_type" = 'article';
