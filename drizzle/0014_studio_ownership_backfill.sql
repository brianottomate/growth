-- Preserve the currently known platform creative independently of its source ad.
UPDATE platform_ad SET pushed_creative = jsonb_build_object(
  'name', coalesce(name, ''), 'headline', headline, 'body', body,
  'linkUrl', link_url, 'media', media, 'copy', copy
) WHERE pushed_creative IS NULL;
--> statement-breakpoint
-- Recipes remain on the ad; the approved package contains output fields only.
UPDATE ad SET approved_snapshot = jsonb_build_object(
  'content', content - 'ideaStudio', 'placements', placements,
  'approvedAt', coalesce(approved_at, updated_at), 'approvedBy', approved_by
) WHERE status = 'approved' AND approved_by IS NOT NULL AND approved_snapshot IS NULL;
--> statement-breakpoint
-- Unapproved legacy campaign ads return to the Studio pool. No provider delivery changes.
UPDATE ad SET campaign_id = NULL, updated_at = now()
WHERE campaign_id IS NOT NULL AND status IN ('drawn', 'ready');
