CREATE TABLE "article_acceptance" (
	"document_id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_acceptance" ADD CONSTRAINT "article_acceptance_document_id_production_packet_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."production_packet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_acceptance" ADD CONSTRAINT "article_acceptance_revision_id_article_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."article_revision"("id") ON DELETE cascade ON UPDATE no action;