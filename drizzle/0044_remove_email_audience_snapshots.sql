-- Move existing Postmark send references to their owning audience before dropping
-- the redundant saved-selection layer. Customer.io send history is untouched.
UPDATE "message_send" AS sends
SET "audience_reference" = selections."audience_id",
    "snapshot" = jsonb_set(sends."snapshot", '{audience}',
      ((sends."snapshot"->'audience') - 'snapshotId') ||
      jsonb_build_object('audienceId', selections."audience_id"))
FROM "email_audience_snapshot" AS selections
WHERE sends."provider" = 'postmark'
  AND sends."snapshot" #>> '{audience,snapshotId}' = selections."id";
--> statement-breakpoint
UPDATE "platform_post" AS posts
SET "metadata" = jsonb_set(posts."metadata", '{emailDelivery,audienceReference}', to_jsonb(selections."audience_id"))
FROM "email_audience_snapshot" AS selections
WHERE posts."metadata" #>> '{emailDelivery,audienceReference}' = selections."id";
--> statement-breakpoint
DROP TABLE "email_audience_snapshot";
