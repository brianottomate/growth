-- A seed list keeps which starting point built it; each build keeps the filters
-- it ran. Own-booker lists become the past-bookers template; AI-built lists keep
-- their filters on their builds and rebuild from them.
ALTER TABLE "seed_list" RENAME COLUMN "definition" TO "origin";--> statement-breakpoint
UPDATE "seed_list" SET "origin" = CASE
  WHEN ("origin"->>'clientBookers')::boolean AND NOT COALESCE(("origin"->>'wander')::boolean, false)
    THEN '{"template":"past_bookers"}'::jsonb
  ELSE jsonb_build_object('template', 'described', 'steer', "name")
END;--> statement-breakpoint
UPDATE "seed_snapshot" SET "definition" = ("definition" - 'uploadedListIds') || '{"kind":"query"}'::jsonb;
