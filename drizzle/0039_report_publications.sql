CREATE TABLE "performance_report_share" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"token" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_report_share" ADD CONSTRAINT "performance_report_share_report_id_performance_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."performance_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_report_share" ADD CONSTRAINT "performance_report_share_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "performance_report_share_token_idx" ON "performance_report_share" USING btree ("token");--> statement-breakpoint
CREATE INDEX "performance_report_share_report_idx" ON "performance_report_share" USING btree ("report_id");
--> statement-breakpoint
-- Preserve the content and token of every existing link, including draft previews.
-- New drafts have no share until an operator publishes a reviewed snapshot.
INSERT INTO "performance_report_share" ("id", "report_id", "organization_id", "token", "snapshot", "created_at")
SELECT 'rptshare_legacy_' || r.id, r.id, a.organization_id, r.token,
  jsonb_build_object(
    'clientName', a.name, 'periodLabel', r.period_label,
    'startDate', r.start_date::text, 'endDate', r.end_date::text,
    'channels', r.channels, 'metrics', r.metrics, 'otherBookings', r.other_bookings,
    'highlights', r.highlights, 'deliverables', r.deliverables, 'sources', r.sources,
    'narrative', r.narrative, 'recommendations', r.recommendations,
    'status', r.status::text,
    'publishedAt', CASE WHEN r.published_at IS NULL THEN NULL ELSE to_char(r.published_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
  ), r.created_at
FROM "performance_report" r JOIN "performance_account" a ON a.id = r.account_id;
