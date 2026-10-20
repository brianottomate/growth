ALTER TABLE "message_send" DROP COLUMN "dispatch_cursor";--> statement-breakpoint
ALTER TABLE "email_audience" DROP COLUMN "revision";--> statement-breakpoint
ALTER TABLE "email"."list" DROP COLUMN "member_count";
--> statement-breakpoint
-- One accepted provider request per broadcast; preserve other post metadata.
UPDATE "platform_post"
SET "metadata" = jsonb_set("metadata", '{emailDelivery}',
  (("metadata"->'emailDelivery') - 'bulkRequests') ||
  jsonb_build_object('bulkRequest', "metadata" #> '{emailDelivery,bulkRequests,0}'))
WHERE "metadata" #>> '{emailDelivery,provider}' = 'postmark'
  AND jsonb_array_length("metadata" #> '{emailDelivery,bulkRequests}') = 1;
--> statement-breakpoint
UPDATE "message_send"
SET "snapshot" = "snapshot" #- '{schedule,customerIoStopped}'
WHERE "provider" = 'postmark'
  AND "snapshot" #> '{schedule,customerIoStopped}' IS NOT NULL;
