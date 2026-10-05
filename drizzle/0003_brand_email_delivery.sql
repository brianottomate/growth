CREATE TABLE "message_send_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"message_send_id" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "brand" ADD COLUMN "email_delivery" jsonb;--> statement-breakpoint
ALTER TABLE "message_send" ADD COLUMN "dispatch_cursor" text;--> statement-breakpoint
ALTER TABLE "message_send_recipient" ADD CONSTRAINT "message_send_recipient_message_send_id_message_send_id_fk" FOREIGN KEY ("message_send_id") REFERENCES "public"."message_send"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_send_recipient_email_idx" ON "message_send_recipient" USING btree ("message_send_id","email");--> statement-breakpoint
CREATE INDEX "message_send_recipient_status_idx" ON "message_send_recipient" USING btree ("message_send_id","status");--> statement-breakpoint
UPDATE "brand" SET "email_delivery" = '{"provider":"postmark","serverId":21064505,"messageStream":"broadcast"}'::jsonb WHERE "slug" = 'winter-park-escapes' AND "organization_id" IS NOT NULL AND "email_delivery" IS NULL;--> statement-breakpoint
UPDATE "brand" SET "email_delivery" = '{"provider":"postmark","serverId":21064506,"messageStream":"broadcast"}'::jsonb WHERE "slug" = 'chalets-hh' AND "organization_id" IS NOT NULL AND "email_delivery" IS NULL;
