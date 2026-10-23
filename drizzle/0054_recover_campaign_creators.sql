-- Recover only proven creation: a successful creation receipt for the exact
-- campaign, in the same organization, during its actual creation window.
-- Read/edit/attach receipts and conflicting creator identities are excluded.
WITH proven_creators AS (
  SELECT c.id, min(r.user_id) AS user_id
  FROM campaign c
  JOIN brand b ON b.id = c.brand_id
  JOIN assistant_tool_receipt t
    ON t.output -> 'data' -> 'campaign' ->> 'id' = c.id
  JOIN assistant_run r ON r.id = t.run_id
  JOIN "user" u ON u.id = r.user_id
  WHERE c.created_by IS NULL
    AND t.tool_name IN ('adsWrite__draftCampaign', 'adsWrite__duplicateCampaign')
    AND t.status = 'completed'
    AND t.output ->> 'ok' = 'true'
    AND r.organization_id = b.organization_id
    AND c.created_at BETWEEN t.started_at - interval '1 second'
                         AND t.finished_at + interval '1 second'
  GROUP BY c.id
  HAVING count(DISTINCT r.user_id) = 1
)
UPDATE campaign c SET created_by = p.user_id
FROM proven_creators p
WHERE c.id = p.id AND c.created_by IS NULL;
