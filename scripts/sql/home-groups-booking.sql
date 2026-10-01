DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand' AND column_name = 'wander_os_enabled') THEN
  ALTER TABLE public.brand ADD COLUMN wander_os_enabled boolean NOT NULL DEFAULT false;
  UPDATE public.brand SET wander_os_enabled = true WHERE wander_os_website_id IS NOT NULL;
 END IF;
END $$;
DO $$ BEGIN CREATE TYPE public.home_group_kind AS ENUM ('featured', 'custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.home_group (
 id text PRIMARY KEY, brand_id text NOT NULL, name text NOT NULL, kind public.home_group_kind NOT NULL DEFAULT 'custom', description text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT home_group_brand_id_brand_id_fk FOREIGN KEY (brand_id) REFERENCES public.brand(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS home_group_brand_idx ON public.home_group(brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS home_group_featured_unique ON public.home_group(brand_id) WHERE kind = 'featured';
CREATE TABLE IF NOT EXISTS public.home_group_member (
 group_id text NOT NULL, home_id text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
 CONSTRAINT home_group_member_group_id_home_id_pk PRIMARY KEY(group_id, home_id),
 CONSTRAINT home_group_member_group_id_home_group_id_fk FOREIGN KEY(group_id) REFERENCES public.home_group(id) ON DELETE CASCADE,
 CONSTRAINT home_group_member_home_id_home_id_fk FOREIGN KEY(home_id) REFERENCES public.home(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS home_group_member_home_idx ON public.home_group_member(home_id);
CREATE TABLE IF NOT EXISTS public.booking_target (
 id text PRIMARY KEY, brand_id text NOT NULL, name text NOT NULL, home_group_id text, home_id text, check_in text, check_out text, guests integer,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT booking_target_brand_id_brand_id_fk FOREIGN KEY(brand_id) REFERENCES public.brand(id) ON DELETE CASCADE,
 CONSTRAINT booking_target_home_group_id_home_group_id_fk FOREIGN KEY(home_group_id) REFERENCES public.home_group(id) ON DELETE RESTRICT,
 CONSTRAINT booking_target_home_id_home_id_fk FOREIGN KEY(home_id) REFERENCES public.home(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS booking_target_brand_idx ON public.booking_target(brand_id);
ALTER TABLE public.campaign ADD COLUMN IF NOT EXISTS booking_target_id text CONSTRAINT campaign_booking_target_id_booking_target_id_fk REFERENCES public.booking_target(id) ON DELETE SET NULL;
ALTER TABLE public.ad ADD COLUMN IF NOT EXISTS booking_target_id text CONSTRAINT ad_booking_target_id_booking_target_id_fk REFERENCES public.booking_target(id) ON DELETE SET NULL;

-- The old flag remains a compatibility projection for callers and older deployments.
-- Group membership is the durable selection; triggers keep both paths consistent.
INSERT INTO public.home_group(id, brand_id, name, kind)
 SELECT 'hgroup_featured_' || id, id, 'Featured homes', 'featured' FROM public.brand
 ON CONFLICT DO NOTHING;
INSERT INTO public.home_group_member(group_id, home_id, sort_order)
 SELECT g.id, h.id, coalesce(h.sort_order, 0) FROM public.home h JOIN public.home_group g ON g.brand_id = h.brand_id AND g.kind = 'featured'
 WHERE h.featured = true AND h.deleted_at IS NULL ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.growth_default_home_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.home_group(id, brand_id, name, kind) VALUES ('hgroup_featured_' || NEW.id, NEW.id, 'Featured homes', 'featured') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS growth_default_home_group ON public.brand;
CREATE TRIGGER growth_default_home_group AFTER INSERT ON public.brand FOR EACH ROW EXECUTE FUNCTION public.growth_default_home_group();

CREATE OR REPLACE FUNCTION public.growth_home_group_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.home_group g JOIN public.home h ON h.brand_id = g.brand_id WHERE g.id = NEW.group_id AND h.id = NEW.home_id AND h.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'Home and group must belong to the same brand'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS growth_home_group_scope ON public.home_group_member;
CREATE TRIGGER growth_home_group_scope BEFORE INSERT OR UPDATE ON public.home_group_member FOR EACH ROW EXECUTE FUNCTION public.growth_home_group_scope();

CREATE OR REPLACE FUNCTION public.growth_featured_flag_to_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid text;
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 SELECT id INTO gid FROM public.home_group WHERE brand_id = NEW.brand_id AND kind = 'featured';
 IF NEW.featured AND NEW.deleted_at IS NULL THEN
  INSERT INTO public.home_group_member(group_id, home_id, sort_order) VALUES (gid, NEW.id, coalesce(NEW.sort_order, 0)) ON CONFLICT(group_id, home_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
 ELSE DELETE FROM public.home_group_member WHERE group_id = gid AND home_id = NEW.id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS growth_featured_flag_to_group ON public.home;
CREATE TRIGGER growth_featured_flag_to_group AFTER INSERT OR UPDATE OF featured, sort_order, deleted_at ON public.home FOR EACH ROW EXECUTE FUNCTION public.growth_featured_flag_to_group();

CREATE OR REPLACE FUNCTION public.growth_featured_group_to_flag() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid text; hid text; featured_group boolean;
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN COALESCE(NEW, OLD); END IF;
 gid := CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END;
 hid := CASE WHEN TG_OP = 'DELETE' THEN OLD.home_id ELSE NEW.home_id END;
 SELECT kind = 'featured' INTO featured_group FROM public.home_group WHERE id = gid;
 IF featured_group THEN
  UPDATE public.home SET featured = (TG_OP <> 'DELETE'), sort_order = CASE WHEN TG_OP = 'DELETE' THEN sort_order ELSE NEW.sort_order END WHERE id = hid;
 END IF;
 RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS growth_featured_group_to_flag ON public.home_group_member;
CREATE TRIGGER growth_featured_group_to_flag AFTER INSERT OR DELETE OR UPDATE OF sort_order ON public.home_group_member FOR EACH ROW EXECUTE FUNCTION public.growth_featured_group_to_flag();

CREATE OR REPLACE FUNCTION public.growth_booking_target_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.home_id IS NOT NULL AND NEW.home_group_id IS NOT NULL THEN RAISE EXCEPTION 'Choose one home or group'; END IF;
 IF NEW.home_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.home WHERE id = NEW.home_id AND brand_id = NEW.brand_id) THEN RAISE EXCEPTION 'Home belongs to another brand'; END IF;
 IF NEW.home_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.home_group WHERE id = NEW.home_group_id AND brand_id = NEW.brand_id) THEN RAISE EXCEPTION 'Group belongs to another brand'; END IF;
 IF (NEW.check_in IS NULL) <> (NEW.check_out IS NULL) OR (NEW.check_in IS NOT NULL AND NEW.check_out <= NEW.check_in) THEN RAISE EXCEPTION 'Invalid stay dates'; END IF;
 IF NEW.guests IS NOT NULL AND NEW.guests < 1 THEN RAISE EXCEPTION 'Invalid guest count'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS growth_booking_target_scope ON public.booking_target;
CREATE TRIGGER growth_booking_target_scope BEFORE INSERT OR UPDATE ON public.booking_target FOR EACH ROW EXECUTE FUNCTION public.growth_booking_target_scope();
