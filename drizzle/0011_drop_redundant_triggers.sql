-- These triggers repeated app logic. Save paths reset "ready"; saveBookingTarget validates targets.
DROP TRIGGER IF EXISTS growth_ad_ready_clears_on_edit ON public.ad;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_ad_ready_clears_on_edit();
--> statement-breakpoint
-- saveBookingTarget validates scope, dates and guests in the app; it is the only writer.
DROP TRIGGER IF EXISTS growth_booking_target_scope ON public.booking_target;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_booking_target_scope();
--> statement-breakpoint
-- Members are only ever added to a group of the home's own brand, and every
-- reader creates or tolerates a missing primary group.
DROP TRIGGER IF EXISTS growth_home_group_scope ON public.home_group_member;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_home_group_scope();--> statement-breakpoint
DROP TRIGGER IF EXISTS growth_default_home_group ON public.brand;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.growth_default_home_group();
