-- The hand-made source is called custom, as the app already calls those groups.
-- Idempotent: an earlier numbering of this migration already ran on the shared
-- database from its preview build.
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'home_group_source' AND e.enumlabel = 'manual'
 ) THEN
  ALTER TYPE "public"."home_group_source" RENAME VALUE 'manual' TO 'custom';
 END IF;
END $$;--> statement-breakpoint
-- The schema no longer has home.featured, home_group.kind, their enum or the
-- featured index, but the released app still reads them, so the database keeps
-- them, and the triggers that sync them, until the next migration drops them
-- after this release.
SELECT 1;
