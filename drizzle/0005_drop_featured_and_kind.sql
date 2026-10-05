-- Groups the previous release's import created as Featured got the default
-- source; they were our suggestion.
UPDATE "home_group" SET "source" = 'suggested' WHERE "is_primary" AND "source" = 'custom' AND "name" = 'Featured homes';--> statement-breakpoint
DROP TRIGGER IF EXISTS growth_featured_flag_to_group ON public.home;--> statement-breakpoint
DROP TRIGGER IF EXISTS growth_featured_group_to_flag ON public.home_group_member;--> statement-breakpoint
DROP TRIGGER IF EXISTS growth_home_group_kind_mirror ON public.home_group;--> statement-breakpoint
DROP TRIGGER IF EXISTS growth_primary_group_to_flags ON public.home_group;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_featured_flag_to_group();--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_featured_group_to_flag();--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_home_group_kind_mirror();--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_primary_group_to_flags();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.growth_default_home_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 INSERT INTO public.home_group(id, brand_id, name, is_primary, source) VALUES ('hgroup_featured_' || NEW.id, NEW.id, 'Featured homes', true, 'suggested') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $function$;--> statement-breakpoint
-- A home that leaves the record leaves its groups, as the flag trigger did.
CREATE OR REPLACE FUNCTION public.growth_home_leaves_groups()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
  DELETE FROM public.home_group_member WHERE home_id = NEW.id;
 END IF;
 RETURN NEW;
END $function$;--> statement-breakpoint
CREATE TRIGGER growth_home_leaves_groups AFTER UPDATE OF deleted_at ON public.home FOR EACH ROW EXECUTE FUNCTION growth_home_leaves_groups();--> statement-breakpoint
DROP INDEX IF EXISTS "home_group_featured_unique";--> statement-breakpoint
ALTER TABLE "home" DROP COLUMN IF EXISTS "featured";--> statement-breakpoint
ALTER TABLE "home_group" DROP COLUMN IF EXISTS "kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."home_group_kind";
