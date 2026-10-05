CREATE TABLE IF NOT EXISTS public.initiative (
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
 lead_brand_id text REFERENCES public.brand(id) ON DELETE SET NULL,
 owner_id text REFERENCES public."user"(id) ON DELETE SET NULL,
 name text NOT NULL,
 description text,
 status text NOT NULL DEFAULT 'planned',
 start_at timestamptz,
 end_at timestamptz,
 created_at timestamp NOT NULL,
 updated_at timestamp NOT NULL,
 CONSTRAINT initiative_status_check CHECK (status IN ('planned', 'active', 'paused', 'completed', 'archived')),
 CONSTRAINT initiative_dates_check CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);
CREATE INDEX IF NOT EXISTS initiative_org_idx ON public.initiative(organization_id);
CREATE TABLE IF NOT EXISTS public.initiative_member (
 id text PRIMARY KEY,
 initiative_id text NOT NULL REFERENCES public.initiative(id) ON DELETE CASCADE,
 content_post_id text REFERENCES public.content_post(id) ON DELETE CASCADE,
 series_id text REFERENCES public.series(id) ON DELETE CASCADE,
 campaign_id text REFERENCES public.campaign(id) ON DELETE CASCADE,
 created_at timestamp NOT NULL,
 CONSTRAINT initiative_member_one_target CHECK (num_nonnulls(content_post_id, series_id, campaign_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS initiative_member_post_unique ON public.initiative_member(initiative_id, content_post_id);
CREATE UNIQUE INDEX IF NOT EXISTS initiative_member_series_unique ON public.initiative_member(initiative_id, series_id);
CREATE UNIQUE INDEX IF NOT EXISTS initiative_member_campaign_unique ON public.initiative_member(initiative_id, campaign_id);
CREATE INDEX IF NOT EXISTS initiative_member_post_idx ON public.initiative_member(content_post_id);
CREATE INDEX IF NOT EXISTS initiative_member_series_idx ON public.initiative_member(series_id);
CREATE INDEX IF NOT EXISTS initiative_member_campaign_idx ON public.initiative_member(campaign_id);
