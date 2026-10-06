-- "Ready for review" holds only for what was marked. Any edit to the ad's
-- creative, copy, routing or name sends it back to draft, whichever of the
-- many write paths made it. Status is compared as text: the enum value is new
-- in this release and cannot be named inside the migration's transaction.
CREATE OR REPLACE FUNCTION public.growth_ad_ready_clears_on_edit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status::text = 'ready' AND NEW.status::text = 'ready' AND (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.placements IS DISTINCT FROM OLD.placements OR
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.home_id IS DISTINCT FROM OLD.home_id OR
    NEW.booking_target_id IS DISTINCT FROM OLD.booking_target_id OR
    NEW.platforms IS DISTINCT FROM OLD.platforms
  ) THEN
    NEW.status := 'drawn';
    NEW.ready_at := NULL;
    NEW.ready_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER growth_ad_ready_clears_on_edit BEFORE UPDATE ON public.ad FOR EACH ROW EXECUTE FUNCTION growth_ad_ready_clears_on_edit();--> statement-breakpoint
-- Approvals so far lived in the ad's idea document; the columns take over.
UPDATE public.ad SET
  approved_at = coalesce(
    (content->'ideaStudio'->'approval'->>'approvedAt')::timestamptz::timestamp,
    updated_at
  ),
  approved_by = (
    SELECT u.id FROM public."user" u
    WHERE u.id = content->'ideaStudio'->'approval'->>'approvedBy'
  )
WHERE status::text = 'approved' AND approved_at IS NULL;
