-- UI optimistic versions are ISO timestamps at JavaScript millisecond precision.
-- The ownership backfill used now(), whose microseconds otherwise reject a fresh
-- browser's matching version in equality checks. Preserve the same millisecond.
UPDATE "ad"
SET "updated_at" = date_trunc('milliseconds', "updated_at")
WHERE "updated_at" <> date_trunc('milliseconds', "updated_at");
