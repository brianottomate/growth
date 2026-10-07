ALTER TABLE "content_comment" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "content_comment" ADD COLUMN "home_id" text;--> statement-breakpoint
ALTER TABLE "content_comment" ADD COLUMN "actor_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_comment" ADD COLUMN "via_agent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_comment" ADD COLUMN "agent_run_id" text;--> statement-breakpoint
ALTER TABLE "content_comment" ADD COLUMN "event" text DEFAULT 'comment' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "approved_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "platform_ad" ADD COLUMN "pushed_creative" jsonb;--> statement-breakpoint
ALTER TABLE "content_comment" ADD CONSTRAINT "content_comment_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_comment" ADD CONSTRAINT "content_comment_home_id_home_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."home"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_comment_ad_idx" ON "content_comment" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "content_comment_home_idx" ON "content_comment" USING btree ("home_id");--> statement-breakpoint
ALTER TABLE "content_comment" ADD CONSTRAINT "content_comment_subject_check" CHECK (num_nonnulls("content_comment"."content_post_id", "content_comment"."platform_post_id", "content_comment"."ad_id", "content_comment"."home_id") = 1);--> statement-breakpoint
ALTER TABLE "content_comment" ADD CONSTRAINT "content_comment_actor_check" CHECK ("content_comment"."actor_kind" in ('user', 'agent'));