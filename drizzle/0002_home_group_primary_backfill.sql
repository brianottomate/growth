-- Every Featured group becomes the brand's primary group. It was our
-- suggestion unless an applied intake replaced its homes with the client's.
UPDATE "home_group" SET "is_primary" = true, "source" = 'suggested' WHERE "kind" = 'featured';--> statement-breakpoint
UPDATE "home_group" g SET "source" = 'intake', "name" = 'Client’s picks'
FROM "performance_account" a
JOIN "performance_intake" i ON i."account_id" = a."id"
WHERE a."brand_id" = g."brand_id"
  AND g."kind" = 'featured'
  AND i."status" = 'applied'
  AND i."applied_summary"::text ILIKE '%featured homes%';--> statement-breakpoint
-- A new brand's default group is the one our suggestion fills.
CREATE OR REPLACE FUNCTION public.growth_default_home_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 INSERT INTO public.home_group(id, brand_id, name, kind, is_primary, source) VALUES ('hgroup_featured_' || NEW.id, NEW.id, 'Featured homes', 'featured', true, 'suggested') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $function$;--> statement-breakpoint
-- Until `kind` is dropped it mirrors is_primary, so code that still writes
-- kind = 'featured' gets a primary group and the featured-flag triggers,
-- which read kind, follow whichever group is primary.
CREATE OR REPLACE FUNCTION public.growth_home_group_kind_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP = 'INSERT' AND NEW.kind = 'featured' THEN NEW.is_primary := true; END IF;
 NEW.kind := CASE WHEN NEW.is_primary THEN 'featured'::public.home_group_kind ELSE 'custom'::public.home_group_kind END;
 RETURN NEW;
END $function$;--> statement-breakpoint
CREATE TRIGGER growth_home_group_kind_mirror BEFORE INSERT OR UPDATE ON public.home_group FOR EACH ROW EXECUTE FUNCTION growth_home_group_kind_mirror();--> statement-breakpoint
-- A group that becomes primary hands its members to home.featured. The nested
-- update skips the flag-to-group trigger, which returns at depth > 1.
CREATE OR REPLACE FUNCTION public.growth_primary_group_to_flags()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NEW.is_primary AND NOT OLD.is_primary THEN
  UPDATE public.home h
  SET featured = m.home_id IS NOT NULL,
      sort_order = coalesce(m.sort_order, h.sort_order)
  FROM public.home h2
  LEFT JOIN public.home_group_member m ON m.group_id = NEW.id AND m.home_id = h2.id
  WHERE h.id = h2.id AND h.brand_id = NEW.brand_id AND h.deleted_at IS NULL;
 END IF;
 RETURN NEW;
END $function$;--> statement-breakpoint
CREATE TRIGGER growth_primary_group_to_flags AFTER UPDATE OF is_primary ON public.home_group FOR EACH ROW EXECUTE FUNCTION growth_primary_group_to_flags();
