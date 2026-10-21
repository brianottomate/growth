-- #538 (2026-10-05) replaced the launch checklist items with the onboarding set.
-- Records written before it still hold the retired items, which fail the
-- checklist read contract and are carried forward by every later write. They
-- have no onboarding equivalent, so they are dropped from items and history.
-- Receipts are kept.
UPDATE "brand"
SET "performance_checklist" = jsonb_set(
  jsonb_set(
    "performance_checklist",
    '{launch,items}',
    coalesce("performance_checklist" -> 'launch' -> 'items', '{}'::jsonb)
      - ARRAY['homes', 'contacts', 'mark', 'folder', 'previews', 'ads', 'campaign', 'audience', 'pushed', 'live']
  ),
  '{launch,history}',
  coalesce(
    (
      SELECT jsonb_agg(h.event ORDER BY h.position)
      FROM jsonb_array_elements(
        coalesce("performance_checklist" -> 'launch' -> 'history', '[]'::jsonb)
      ) WITH ORDINALITY AS h(event, position)
      WHERE NOT (h.event ->> 'item' = ANY (ARRAY['homes', 'contacts', 'mark', 'folder', 'previews', 'ads', 'campaign', 'audience', 'pushed', 'live']))
    ),
    '[]'::jsonb
  )
)
WHERE "performance_checklist" -> 'launch' IS NOT NULL
  AND (
    coalesce("performance_checklist" -> 'launch' -> 'items', '{}'::jsonb)
      ?| ARRAY['homes', 'contacts', 'mark', 'folder', 'previews', 'ads', 'campaign', 'audience', 'pushed', 'live']
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        coalesce("performance_checklist" -> 'launch' -> 'history', '[]'::jsonb)
      ) AS h(event)
      WHERE h.event ->> 'item' = ANY (ARRAY['homes', 'contacts', 'mark', 'folder', 'previews', 'ads', 'campaign', 'audience', 'pushed', 'live'])
    )
  );
