/** Additive migration; never stores customer records. Cutover executes once. */
export const campaignAudienceStatements = [
  `ALTER TABLE persona ADD COLUMN IF NOT EXISTS destination_geography jsonb`,
  `ALTER TABLE audience ADD COLUMN IF NOT EXISTS home_ids jsonb`,
  `ALTER TABLE platform_audience ADD COLUMN IF NOT EXISTS seed_metadata jsonb`,
  `DO $$ BEGIN
    IF to_regclass('campaign_audience_asset') IS NULL THEN
      CREATE TABLE campaign_audience_asset (
        id text PRIMARY KEY,
        audience_id text NOT NULL REFERENCES audience(id) ON DELETE CASCADE,
        platform_audience_id text NOT NULL REFERENCES platform_audience(id) ON DELETE CASCADE,
        platform channel_platform NOT NULL,
        CONSTRAINT campaign_audience_asset_platform_idx UNIQUE(audience_id, platform)
      );
      INSERT INTO campaign_audience_asset(id, audience_id, platform_audience_id, platform)
        SELECT 'caasset_migrated_' || p.id, p.audience_id, p.id, c.platform
        FROM platform_audience p JOIN channel c ON c.id=p.channel_id
        JOIN audience a ON a.id=p.audience_id AND a.brand_id=p.brand_id
        WHERE p.audience_id IS NOT NULL ORDER BY p.updated_at DESC
        ON CONFLICT DO NOTHING;
      INSERT INTO campaign_audience_asset(id, audience_id, platform_audience_id, platform)
        SELECT 'caasset_persona_' || a.id || '_' || p.id, a.id, p.id, c.platform
        FROM audience a JOIN platform_audience p ON p.persona_id=a.persona_id AND p.brand_id=a.brand_id
        JOIN channel c ON c.id=p.channel_id
        WHERE a.persona_id IS NOT NULL AND p.external_id IS NOT NULL
        ORDER BY p.updated_at DESC ON CONFLICT DO NOTHING;
      UPDATE platform_audience SET audience_id=NULL WHERE audience_id IS NOT NULL;
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS campaign_audience_asset_asset_idx ON campaign_audience_asset(platform_audience_id)`,
];
export async function migrateCampaignAudiences(tx: {
  unsafe: (sql: string) => PromiseLike<unknown>;
}) {
  for (const statement of campaignAudienceStatements)
    await tx.unsafe(statement);
}
