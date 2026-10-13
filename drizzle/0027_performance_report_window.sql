ALTER TABLE "performance_report" DROP CONSTRAINT "performance_report_cycle_id_performance_cycle_id_fk";
--> statement-breakpoint
ALTER TABLE "performance_report" ALTER COLUMN "cycle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ALTER COLUMN "metrics" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD COLUMN "start_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD COLUMN "end_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD COLUMN "channels" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD COLUMN "other_bookings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD COLUMN "highlights" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD COLUMN "deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_report" ADD CONSTRAINT "performance_report_cycle_id_performance_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."performance_cycle"("id") ON DELETE set null ON UPDATE no action;