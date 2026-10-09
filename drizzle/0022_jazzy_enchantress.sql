ALTER TABLE "audience" ADD COLUMN "geography" jsonb;
--> statement-breakpoint
-- Initialize geographic intent only when unpublished plans agree. Conflicting plans remain unset.
WITH proposed AS (
  SELECT g.audience_id,
    CASE WHEN p.platform = 'google_ads' THEN p.settings->'google'->'geography'
      ELSE g.configuration->'targeting'->'geography' END AS geography
  FROM platform_delivery_group g JOIN platform_campaign p ON p.id = g.platform_campaign_id
  JOIN audience a ON a.id = g.audience_id AND a.brand_id = p.brand_id AND a.campaign_id = p.campaign_id
  WHERE p.external_id IS NULL
), agreed AS (
  SELECT audience_id, min(geography::text)::jsonb AS geography FROM proposed
  WHERE geography IS NOT NULL AND geography <> '{}'::jsonb AND geography <> 'null'::jsonb
  GROUP BY audience_id HAVING count(DISTINCT geography::text) = 1
)
UPDATE audience a SET geography = agreed.geography FROM agreed WHERE a.id = agreed.audience_id;
