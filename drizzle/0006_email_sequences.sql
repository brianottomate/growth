CREATE TABLE "lifecycle_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"step_id" text NOT NULL,
	"position" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"first_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"lease_token" text,
	"message_id" text,
	"next_dispatch_at" timestamp with time zone,
	"provider_email_id" text,
	"provider_status" text,
	"sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "lifecycle_enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"event_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"runtime_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_execution" (
	"sequence_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"revision_id" text,
	"runtime_id" text,
	"ingest_token_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"email" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"consent_source" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"suppressed_at" timestamp with time zone,
	"suppression_reason" text,
	"unsubscribe_token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequence_step" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"platform_post_id" text,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"wait_minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequence" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"trigger_event" text NOT NULL,
	"exit_condition" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lifecycle_delivery" ADD CONSTRAINT "lifecycle_delivery_enrollment_id_lifecycle_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."lifecycle_enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_enrollment" ADD CONSTRAINT "lifecycle_enrollment_sequence_id_email_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_enrollment" ADD CONSTRAINT "lifecycle_enrollment_revision_id_lifecycle_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."lifecycle_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_enrollment" ADD CONSTRAINT "lifecycle_enrollment_recipient_id_lifecycle_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."lifecycle_recipient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_execution" ADD CONSTRAINT "lifecycle_execution_sequence_id_email_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_recipient" ADD CONSTRAINT "lifecycle_recipient_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_revision" ADD CONSTRAINT "lifecycle_revision_sequence_id_email_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequence_step" ADD CONSTRAINT "email_sequence_step_sequence_id_email_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequence_step" ADD CONSTRAINT "email_sequence_step_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequence" ADD CONSTRAINT "email_sequence_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_delivery_step_idx" ON "lifecycle_delivery" USING btree ("enrollment_id","step_id");--> statement-breakpoint
CREATE INDEX "lifecycle_delivery_provider_idx" ON "lifecycle_delivery" USING btree ("provider_email_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_enrollment_event_idx" ON "lifecycle_enrollment" USING btree ("sequence_id","event_id");--> statement-breakpoint
CREATE INDEX "lifecycle_enrollment_program_status_idx" ON "lifecycle_enrollment" USING btree ("sequence_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_recipient_brand_email_idx" ON "lifecycle_recipient" USING btree ("brand_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_recipient_unsubscribe_idx" ON "lifecycle_recipient" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "email_sequence_step_position_idx" ON "email_sequence_step" USING btree ("sequence_id","position");--> statement-breakpoint
CREATE INDEX "email_sequence_brand_idx" ON "email_sequence" USING btree ("brand_id");