-- Consolidate editable email formats. Frozen delivery snapshots remain unchanged.
UPDATE "platform_post"
SET "format" = 'newsletter.broadcast'
WHERE "platform" = 'newsletter' AND "format" = 'newsletter.blast';
--> statement-breakpoint
UPDATE "content_post"
SET "target_spots" = (
  SELECT jsonb_agg(
    CASE WHEN spot->>'platform' = 'newsletter' AND spot->>'format' = 'newsletter.blast'
      THEN jsonb_set(spot, '{format}', '"newsletter.broadcast"'::jsonb)
      ELSE spot END ORDER BY position
  )
  FROM jsonb_array_elements("content_post"."target_spots") WITH ORDINALITY AS targets(spot, position)
)
WHERE "target_spots" @> '[{"platform":"newsletter","format":"newsletter.blast"}]'::jsonb;
