-- Launches retirement. Run with the release that removes all Launches readers.
-- Production applies this diff through the normal release schema push.
-- Preview builds do not apply schema changes to the shared database.
-- No CASCADE: an unexpected dependency aborts the transaction for inspection.
BEGIN;
ALTER TABLE public.campaign DROP COLUMN IF EXISTS launch_id;
ALTER TABLE public.series DROP COLUMN IF EXISTS launch_id;
ALTER TABLE public.content_post DROP COLUMN IF EXISTS launch_id;
DROP TABLE IF EXISTS public.launch;
COMMIT;
