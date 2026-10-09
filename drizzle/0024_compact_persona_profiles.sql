-- Merge existing accepted phrases without changing persona IDs or references.
-- No deduplication or truncation: generated revisions can condense the saved brief.
UPDATE "persona"
SET "profile" = jsonb_build_object(
  'icon', 'users',
  'motivation', "profile"->'motivation',
  'pills', coalesce("profile"->'needs', '[]'::jsonb)
    || coalesce("profile"->'decisionCriteria', '[]'::jsonb)
    || coalesce("profile"->'objections', '[]'::jsonb)
)
WHERE "profile" IS NOT NULL
  AND NOT ("profile" ? 'pills');
