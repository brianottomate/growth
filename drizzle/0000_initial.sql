CREATE SCHEMA "leads";
--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('usd', 'eur', 'nok', 'gbp', 'cad');--> statement-breakpoint
CREATE TYPE "public"."date_format" AS ENUM('mm_dd_yyyy', 'dd_mm_yyyy', 'yyyy_mm_dd');--> statement-breakpoint
CREATE TYPE "public"."organization_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TYPE "public"."access_role" AS ENUM('viewer', 'contributor', 'editor', 'admin', 'owner');--> statement-breakpoint
CREATE TYPE "public"."access_subject_type" AS ENUM('user', 'organization', 'team');--> statement-breakpoint
CREATE TYPE "public"."brand_relationship" AS ENUM('internal', 'client', 'prospect', 'reference');--> statement-breakpoint
CREATE TYPE "public"."brand_type" AS ENUM('company', 'personal');--> statement-breakpoint
CREATE TYPE "public"."business_stage" AS ENUM('prospect', 'pitch_sent', 'meeting_booked', 'signed', 'paid', 'paused', 'lost', 'churned');--> statement-breakpoint
CREATE TYPE "public"."delivery_stage" AS ENUM('not_started', 'intake_sent', 'intake_submitted', 'access_verified', 'ads_review', 'live', 'paused');--> statement-breakpoint
CREATE TYPE "public"."inspiration_purpose" AS ENUM('competitor', 'inspiration');--> statement-breakpoint
CREATE TYPE "public"."channel_kind" AS ENUM('social', 'ad', 'newsletter', 'blog');--> statement-breakpoint
CREATE TYPE "public"."channel_platform" AS ENUM('linkedin', 'instagram', 'x', 'facebook', 'youtube', 'tiktok', 'threads', 'reddit', 'pinterest', 'hackernews', 'lobsters', 'google_ads', 'meta_ads', 'openai_ads', 'reddit_ads', 'linkedin_ads', 'x_ads', 'tiktok_ads', 'pinterest_ads', 'newsletter', 'blog', 'other');--> statement-breakpoint
CREATE TYPE "public"."channel_suggestion_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('connected', 'expired', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."delivery_provider" AS ENUM('zernio', 'customerio', 'instantly', 'hubspot', 'native', 'manual', 'email_forward', 'postmark', 'resend', 'outreach');--> statement-breakpoint
CREATE TYPE "public"."cleanup_status" AS ENUM('keep', 'review', 'candidate', 'should_delete', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."content_origin" AS ENUM('human', 'ai');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('slot', 'draft', 'discovered', 'pending_review', 'approved', 'scheduled', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_suggestion_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."platform_post_source" AS ENUM('scraped', 'owned');--> statement-breakpoint
CREATE TYPE "public"."series_status" AS ENUM('planned', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."assistant_thread_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."production_packet_status" AS ENUM('draft', 'ready', 'archived');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_send_status" AS ENUM('draft', 'approved', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ad_status" AS ENUM('drawn', 'kept', 'approved');--> statement-breakpoint
CREATE TYPE "public"."ad_type" AS ENUM('creative', 'text');--> statement-breakpoint
CREATE TYPE "public"."audience_source" AS ENUM('manual', 'pixel_event', 'customer_list', 'amplitude_cohort', 'lookalike_seed');--> statement-breakpoint
CREATE TYPE "public"."audience_type" AS ENUM('segment', 'keyword', 'intent', 'lookalike', 'custom');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('planned', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."platform_campaign_status" AS ENUM('draft', 'scheduled', 'live', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."conversion_funnel" AS ENUM('supply', 'demand');--> statement-breakpoint
CREATE TYPE "public"."conversion_mode" AS ENUM('once', 'every');--> statement-breakpoint
CREATE TYPE "public"."conversion_status" AS ENUM('wanted', 'not_implemented', 'verified');--> statement-breakpoint
CREATE TYPE "public"."cadence_period" AS ENUM('day', 'week', 'month');--> statement-breakpoint
CREATE TYPE "public"."funnel_stage" AS ENUM('abandoned_search', 'abandoned_wishlist', 'abandoned_cart', 'abandoned_payment');--> statement-breakpoint
CREATE TYPE "leads"."lead_channel_kind" AS ENUM('email', 'phone', 'form', 'chatbot', 'sms');--> statement-breakpoint
CREATE TYPE "leads"."lead_channel_delivery_state" AS ENUM('discovered', 'queued', 'sending', 'sent', 'replied', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "leads"."lead_outreach_status" AS ENUM('draft', 'approved', 'queued', 'sent', 'replied', 'skipped');--> statement-breakpoint
CREATE TYPE "leads"."lead_source" AS ENUM('builtwith', 'hubspot', 'pregen', 'instantly_upload', 'minerva', 'manual', 'other');--> statement-breakpoint
CREATE TYPE "leads"."lead_tier" AS ENUM('tier_1', 'tier_2', 'tier_3', 'untiered');--> statement-breakpoint
CREATE TYPE "leads"."pregen_verdict" AS ENUM('send_worthy', 'regenerate', 'skip');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_kind" AS ENUM('onboarding', 'abandoned_cart', 'reactivation', 'revival', 'transactional', 'behavioral', 'broadcast', 'outbound', 'other');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_program_priority" AS ENUM('must_have', 'should_have', 'nice_to_have');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_program_status" AS ENUM('idea', 'planned', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_run_state" AS ENUM('planned', 'draft', 'running', 'paused', 'stopped', 'ended', 'needs_fixing');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_step_status" AS ENUM('planned', 'active', 'missing');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_step_system" AS ENUM('customerio', 'resend', 'postmark', 'outreach', 'instantly', 'hubspot', 'amplitude', 'system', 'human', 'other');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_workspace" AS ENUM('marketplace', 'os', 'shared');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_channel" AS ENUM('email', 'sms', 'push', 'in_app', 'bdr_task', 'slack', 'webhook', 'other');--> statement-breakpoint
CREATE TYPE "public"."performance_account_status" AS ENUM('prospect', 'onboarding', 'active', 'paused', 'churned');--> statement-breakpoint
CREATE TYPE "public"."performance_cycle_status" AS ENUM('planned', 'live', 'reporting', 'closed');--> statement-breakpoint
CREATE TYPE "public"."performance_intake_status" AS ENUM('submitted', 'verified', 'applied');--> statement-breakpoint
CREATE TYPE "public"."performance_report_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."transactional_criticality" AS ENUM('auth_blocking', 'legal_financial', 'operational', 'informational');--> statement-breakpoint
CREATE TYPE "public"."transactional_domain" AS ENUM('auth', 'booking', 'payments', 'invoicing', 'agreements', 'statements', 'os_tasks', 'os_notifications', 'org', 'other');--> statement-breakpoint
CREATE TYPE "public"."transactional_status" AS ENUM('live_legacy', 'live_rebranded', 'live_inhouse', 'dead', 'retired');--> statement-breakpoint
CREATE TYPE "public"."transactional_template_source" AS ENUM('cio_ui', 'design_system', 'none');--> statement-breakpoint
CREATE TYPE "public"."transactional_trigger_kind" AS ENUM('event', 'anchored', 'condition');--> statement-breakpoint
CREATE TYPE "public"."acquisition_shape" AS ENUM('keyword_search', 'owned_inbound', 'provider_alert', 'account_watch');--> statement-breakpoint
CREATE TYPE "public"."listening_trigger" AS ENUM('on_demand', 'scheduled', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."home_media_role" AS ENUM('hero', 'gallery', 'excluded', 'carousel');--> statement-breakpoint
CREATE TYPE "public"."home_source" AS ENUM('wanderos', 'wander', 'manual');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'gif', 'audio', 'file', 'folder');--> statement-breakpoint
CREATE TYPE "public"."media_provider" AS ENUM('r2', 'stream', 'external');--> statement-breakpoint
CREATE TYPE "public"."media_review_status" AS ENUM('suggested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('uploading', 'processing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."media_tag_source" AS ENUM('human', 'ai');--> statement-breakpoint
CREATE TYPE "public"."media_video_analysis_status" AS ENUM('processing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."pregen_native_build_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pregen_native_build_step" AS ENUM('crawl', 'plan', 'generate_sections', 'inject_properties', 'persist_artifact');--> statement-breakpoint
CREATE TYPE "public"."pregen_native_crawl_page_kind" AS ENUM('homepage', 'property', 'property_index', 'other');--> statement-breakpoint
CREATE TYPE "public"."pregen_native_prospect_status" AS ENUM('new', 'building', 'preview_ready', 'claimed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."web_page_type" AS ENUM('home', 'brand', 'seo_landing', 'location_hub', 'location_city', 'location_category', 'property', 'article', 'legal', 'help', 'other');--> statement-breakpoint
CREATE TYPE "public"."home_group_kind" AS ENUM('featured', 'custom');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "organization_role" DEFAULT 'member' NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" text,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp,
	"accepted_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "organization_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"plan" "organization_plan" DEFAULT 'free' NOT NULL,
	"subscription_id" text,
	"subscription_status" text,
	"subscription_current_period_end" timestamp,
	"subscription_cancel_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"active_team_id" text,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"is_anonymous" boolean DEFAULT false,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"date_format" date_format DEFAULT 'mm_dd_yyyy',
	"unit_system" "unit_system" DEFAULT 'metric',
	"preferred_currency" "currency" DEFAULT 'usd',
	"time_zone" text DEFAULT 'UTC',
	"city" text,
	"country" text,
	"onboarding_completed_at" timestamp,
	"onboarding_source" text[] DEFAULT '{}',
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"refresh_id" text,
	"expires_at" timestamp,
	"created_at" timestamp,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"user_id" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"token_endpoint_auth_method" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_clientId_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"scopes" text[] NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"expires_at" timestamp,
	"created_at" timestamp,
	"revoked" timestamp,
	"auth_time" timestamp,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ad_account" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"brand_id" text,
	"is_allowed" boolean DEFAULT false NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"manager_external_id" text,
	"created_by_us" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_account_allowed_brand_check" CHECK ("ad_account"."is_allowed" = false OR "ad_account"."brand_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "access" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"subject_type" "access_subject_type" NOT NULL,
	"subject_id" text NOT NULL,
	"role" "access_role" DEFAULT 'viewer' NOT NULL,
	"permissions" jsonb,
	"label" text,
	"invited_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_inspiration" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"inspiration_brand_id" text NOT NULL,
	"purpose" "inspiration_purpose" DEFAULT 'inspiration' NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"owner_id" text,
	"type" "brand_type" DEFAULT 'company' NOT NULL,
	"relationship" "brand_relationship" DEFAULT 'internal' NOT NULL,
	"business_stage" "business_stage",
	"business_stage_at" timestamp with time zone,
	"delivery_stage" "delivery_stage",
	"delivery_stage_at" timestamp with time zone,
	"wander_os_website_id" text,
	"wander_os_enabled" boolean DEFAULT false NOT NULL,
	"email_sender" jsonb,
	"legal_identity" jsonb,
	"wander_os_checked_at" timestamp with time zone,
	"lead_domain" text,
	"name" text NOT NULL,
	"slug" text,
	"tagline" text,
	"description" text,
	"logo" text,
	"website" text,
	"zernio_profile_id" text,
	"meta_page_id" text,
	"featured_listing_url" text,
	"story" text,
	"markets" jsonb,
	"preview_source_url" text,
	"connect_token" text,
	"connect_token_issued_by_name" text,
	"connect_token_issued_by_email" text,
	"connect_token_issued_at" timestamp with time zone,
	"last_access_check_at" timestamp with time zone,
	"follower_count" integer,
	"website_meta" jsonb,
	"brand_identity" jsonb,
	"brand_mark" jsonb,
	"ad_previews" jsonb,
	"performance_settings" jsonb,
	"performance_checklist" jsonb,
	"brand_fingerprint" jsonb,
	"brand_listening_story" jsonb,
	"industry_research" jsonb,
	"links" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "brand_zernio_profile_owned_check" CHECK ("brand"."zernio_profile_id" IS NULL OR "brand"."organization_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "persona" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"age_ranges" jsonb,
	"geographies" jsonb,
	"demand_geography" jsonb,
	"destination_geography" jsonb,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "brand_pitch" (
	"brand_id" text PRIMARY KEY NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "brand_pitch_revision_positive" CHECK ("brand_pitch"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "channel_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"handle" text NOT NULL,
	"profile_url" text,
	"profile_image_url" text,
	"confidence" real,
	"is_official" boolean,
	"reasoning" text,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"verified" boolean,
	"follower_count" integer,
	"verified_at" timestamp with time zone,
	"verify_error" text,
	"status" "channel_suggestion_status" DEFAULT 'pending' NOT NULL,
	"accepted_channel_id" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"handle" text,
	"display_name" text,
	"profile_image_url" text,
	"banner_image_url" text,
	"external_id" text,
	"profile_url" text,
	"manage_url" text,
	"connection_status" "connection_status" DEFAULT 'connected' NOT NULL,
	"default_provider" "delivery_provider",
	"follower_count" integer,
	"follower_history" jsonb DEFAULT '[]'::jsonb,
	"channel_fingerprint" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "content_assignee" (
	"content_post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "content_assignee_content_post_id_user_id_pk" PRIMARY KEY("content_post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "content_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"content_post_id" text,
	"platform_post_id" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "content_ingest_run" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"requested_by_id" text,
	"mode" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"requested_from" timestamp with time zone,
	"requested_to" timestamp with time zone,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_post" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"series_id" text,
	"owner_id" text,
	"created_by_id" text,
	"title" text,
	"body" text,
	"pillar" text,
	"hook" text,
	"caption_direction" text,
	"visual_direction" text,
	"cta_text" text,
	"cta_keyword" text,
	"kpi" text,
	"planned_at" timestamp with time zone,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"origin" "content_origin" DEFAULT 'human' NOT NULL,
	"slot_kind" text,
	"target_spots" jsonb,
	"media" jsonb,
	"is_seed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "content_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject_post_id" text NOT NULL,
	"target_post_id" text,
	"target_ref" jsonb,
	"proposed" jsonb,
	"confidence" real,
	"reasoning" text,
	"source" text,
	"status" "content_suggestion_status" DEFAULT 'pending' NOT NULL,
	"applied_link_id" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_post_link" (
	"id" text PRIMARY KEY NOT NULL,
	"from_platform_post_id" text NOT NULL,
	"to_platform_post_id" text NOT NULL,
	"kind" text NOT NULL,
	"inject_url_at_publish" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_post" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"content_post_id" text,
	"channel_id" text,
	"platform" "channel_platform" NOT NULL,
	"username" text,
	"format" text,
	"archetype" text,
	"template" text,
	"pillar" text,
	"parent_platform_post_id" text,
	"sequence" integer,
	"source" "platform_post_source" NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"origin" "content_origin",
	"owner_id" text,
	"provider" "delivery_provider",
	"delivery_external_id" text,
	"delivery_status" text,
	"delivery_error" text,
	"delivery_updated_at" timestamp with time zone,
	"first_comment_text" text,
	"first_comment_status" text,
	"first_comment_error" text,
	"first_comment_updated_at" timestamp with time zone,
	"publish_settings" jsonb,
	"ingest_provider" text,
	"text" text,
	"media" jsonb,
	"asset_links" jsonb,
	"stats" jsonb,
	"external_id" text,
	"external_url" text,
	"external_kind" text,
	"amplified_from" jsonb,
	"cleanup_status" "cleanup_status" DEFAULT 'keep' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"scraped_at" timestamp with time zone,
	"is_seed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"theme" text,
	"color" text,
	"pillar" text,
	"status" "series_status" DEFAULT 'planned' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "content_pillar" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"color" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_input" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "assistant_input_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"thread_id" text NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"target_turn_id" text,
	"payload" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_message" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"client_message_id" text NOT NULL,
	"role" text NOT NULL,
	"message" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"thread_id" text,
	"surface" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"model" text,
	"context_manifest" jsonb,
	"summary" jsonb,
	"error" jsonb,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "assistant_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"pinned_brand_id" text,
	"active_content_post_id" text,
	"active_turn_id" text,
	"active_turn_expires_at" timestamp,
	"queue_paused" boolean DEFAULT false NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"visibility" "assistant_thread_visibility" DEFAULT 'private' NOT NULL,
	"title" text DEFAULT 'New session' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_tool_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"thread_id" text,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"policy" jsonb NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "catalog_export" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"source_run_id" text,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "catalog_export_sourceRunId_unique" UNIQUE("source_run_id")
);
--> statement-breakpoint
CREATE TABLE "platform_document" (
	"platform_post_id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_packet" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"content_post_id" text,
	"thread_id" text,
	"source_message_id" text,
	"title" text NOT NULL,
	"document_type" text DEFAULT 'image' NOT NULL,
	"document" jsonb NOT NULL,
	"purpose" text,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"aspect_ratio" text,
	"output_format" text,
	"suggested_tool" text,
	"instructions" text,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"status" "production_packet_status" DEFAULT 'ready' NOT NULL,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "production_packet_document_type_check" CHECK ("production_packet"."document_type" IN ('article','email','image','video') AND "production_packet"."document" @> jsonb_build_object('type',"production_packet"."document_type",'schemaVersion',1))
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"content_post_id" text,
	"thread_id" text,
	"packet_id" text,
	"workflow_type" text NOT NULL,
	"campaign_id" text,
	"workflow_version" integer DEFAULT 1 NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_run_id" text,
	"retry_of_id" text,
	"lock_key" text,
	"claim_token" uuid,
	"started_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"provider" text DEFAULT 'internal' NOT NULL,
	"kind" text,
	"model" text DEFAULT '' NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"input" jsonb NOT NULL,
	"operation" text DEFAULT 'generate' NOT NULL,
	"expires_at" timestamp with time zone,
	"result" jsonb,
	"provider_request_id" text,
	"webhook_token_hash" text,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_output" jsonb,
	"accepted_media_asset_id" text,
	"error" text,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "message_send" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_post_id" text NOT NULL,
	"document_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"provider" text DEFAULT 'customerio' NOT NULL,
	"provider_broadcast_id" text NOT NULL,
	"provider_message_id" text,
	"audience_kind" text NOT NULL,
	"audience_reference" text NOT NULL,
	"audience_label" text NOT NULL,
	"status" "message_send_status" DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"error" text,
	"created_by" text,
	"approved_by" text,
	"sent_by" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postmark_event" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" integer,
	"message_stream" text,
	"record_type" text NOT NULL,
	"message_id" text,
	"recipient" text,
	"tag" text,
	"occurred_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"manager_user_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"atlas" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "storefront_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"storefront_id" text NOT NULL,
	"reference_brand_id" text NOT NULL,
	"purpose" "inspiration_purpose" NOT NULL,
	"name" text NOT NULL,
	"source_url" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"capture_method" text NOT NULL,
	"source_provider" text,
	"source_content_hash" text,
	"model" text,
	"snapshot" jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"manager_user_id" text,
	"surface" text NOT NULL,
	"external_listing_id" text,
	"public_url" text,
	"management_url" text,
	"localized_content_url" text,
	"listing_status" text DEFAULT 'unknown' NOT NULL,
	"content" jsonb NOT NULL,
	"freshness_status" text DEFAULT 'unknown' NOT NULL,
	"stale_note" text,
	"stale_marked_at" timestamp,
	"stale_marked_by" text,
	"confirmed_at" timestamp,
	"confirmed_by" text,
	"changelog" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ad" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"brand_id" text NOT NULL,
	"home_id" text,
	"booking_target_id" text,
	"name" text NOT NULL,
	"type" "ad_type" DEFAULT 'creative' NOT NULL,
	"status" "ad_status" DEFAULT 'drawn' NOT NULL,
	"content" jsonb NOT NULL,
	"placements" jsonb,
	"platforms" "channel_platform"[],
	"business_key" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"persona_id" text,
	"name" text NOT NULL,
	"description" text,
	"type" "audience_type" DEFAULT 'segment' NOT NULL,
	"age_min" integer,
	"age_max" integer,
	"home_ids" jsonb,
	"geography" jsonb,
	"keywords" jsonb,
	"excluded_keywords" jsonb,
	"optimization_goal" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_audience_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"audience_id" text NOT NULL,
	"platform_audience_id" text NOT NULL,
	"platform" "channel_platform" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"goal" text,
	"landing_url" text,
	"booking_target_id" text,
	"description" text,
	"color" text,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"creative_pool" jsonb DEFAULT '[]'::jsonb,
	"homes_run" jsonb,
	"budget" integer,
	"performance_cycle_id" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "platform_ad_set" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_campaign_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"audience_id" text,
	"name" text NOT NULL,
	"status" text,
	"targeting_spec" jsonb,
	"budget" integer,
	"budget_type" text,
	"optimization_goal" text,
	"external_id" text,
	"stats" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_ad" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_campaign_id" text NOT NULL,
	"platform_ad_set_id" text,
	"brand_id" text NOT NULL,
	"channel_id" text,
	"platform" "channel_platform" NOT NULL,
	"ad_id" text,
	"name" text,
	"headline" text,
	"body" text,
	"link_url" text,
	"media" jsonb,
	"copy" jsonb,
	"thumbnail_url" text,
	"status" text,
	"platform_objective" text,
	"optimization_goal" text,
	"bid_strategy" text,
	"external_ad_set_id" text,
	"ad_set_name" text,
	"stats" jsonb,
	"external_id" text,
	"manage_url" text,
	"business_key" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audience" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"audience_id" text,
	"persona_id" text,
	"source_id" text,
	"name" text NOT NULL,
	"type" "audience_type" NOT NULL,
	"source" "audience_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"size_label" text,
	"definition" jsonb,
	"seed_metadata" jsonb,
	"manage_url" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"campaign_id" text,
	"name" text NOT NULL,
	"status" "platform_campaign_status" DEFAULT 'draft' NOT NULL,
	"objective" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"budget" integer,
	"budget_type" text,
	"spend" integer,
	"ad_count" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"stats" jsonb,
	"hero_thumbnail_url" text,
	"external_id" text,
	"manage_url" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_item" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"partner_id" text,
	"kind" text NOT NULL,
	"dedup_key" text NOT NULL,
	"title" text,
	"snippet" text,
	"from_email" text,
	"from_name" text,
	"thread_key" text,
	"received_at" timestamp,
	"source_email_id" text,
	"relevance" integer,
	"intent_tag" text,
	"suggested_action" text,
	"rationale" text,
	"suggested_reply" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_id" text,
	"resolved_by_id" text,
	"resolved_at" timestamp,
	"reply_note" text,
	"decision_note" text,
	"slack_ts" text,
	"slack_channel" text,
	"raw" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_metric_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"partner_id" text,
	"date" date NOT NULL,
	"clicks" integer,
	"actions" integer,
	"revenue" real,
	"commission" real,
	"raw" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_partner" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"state" text,
	"website" text,
	"email" text,
	"partner_group" text,
	"notes" text,
	"raw" jsonb,
	"last_synced_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_program" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"network" text DEFAULT 'impact' NOT NULL,
	"external_program_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_event" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"canonical_event" text,
	"funnel" "conversion_funnel" NOT NULL,
	"stage" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_mapping_source" (
	"mapping_id" text NOT NULL,
	"conversion_event_id" text NOT NULL,
	CONSTRAINT "conversion_mapping_source_mapping_id_conversion_event_id_pk" PRIMARY KEY("mapping_id","conversion_event_id")
);
--> statement-breakpoint
CREATE TABLE "conversion_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"channel_id" text,
	"ad_account_id" text,
	"platform_event_name" text NOT NULL,
	"external_conversion_id" text,
	"external_resource_name" text,
	"mode" "conversion_mode",
	"status" "conversion_status" DEFAULT 'wanted' NOT NULL,
	"notes" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amplification_target" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_post_id" text NOT NULL,
	"amplifier_id" text NOT NULL,
	"ask" text DEFAULT 'planned' NOT NULL,
	"action_kind" text DEFAULT 'repost' NOT NULL,
	"destination_platform" text NOT NULL,
	"output_platform_post_id" text,
	"draft_text" text,
	"planned_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"fulfilled_by_post_id" text,
	"notes" text,
	"performance_cycle_id" text,
	"slack_status" text,
	"slack_channel" text,
	"slack_message_ts" text,
	"slack_error" text,
	"slack_notified_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amplifier" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"handles" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"slack_user_id" text,
	"handoff_preference" text DEFAULT 'manual' NOT NULL,
	"linked_brand_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cadence_target" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"archetype" text NOT NULL,
	"template" text,
	"series_id" text,
	"count" integer NOT NULL,
	"period" "cadence_period" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mix_target" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"channel_id" text,
	"pillar" text NOT NULL,
	"target_pct" integer NOT NULL,
	"period" "cadence_period" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_drift_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"field" text NOT NULL,
	"neon_value" text,
	"bq_value" text,
	"resolution" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_send_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"stage" "funnel_stage" NOT NULL,
	"window_key" text NOT NULL,
	"source" text NOT NULL,
	"sync_status" text,
	"error" text,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_state" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"last_search_ts" timestamp with time zone,
	"last_search_destination" text,
	"last_search_checkin" date,
	"last_search_checkout" date,
	"last_search_flexible" boolean,
	"last_search_trigger" text,
	"last_search_parent_id" text,
	"search_count" integer DEFAULT 0 NOT NULL,
	"last_wishlist_ts" timestamp with time zone,
	"last_wishlist_property" text,
	"last_wishlist_property_id" text,
	"last_reserve_click_ts" timestamp with time zone,
	"last_checkout_preview_ts" timestamp with time zone,
	"last_checkout_preview_property" text,
	"last_checkout_preview_property_id" text,
	"last_checkout_preview_checkin" date,
	"last_checkout_preview_checkout" date,
	"last_checkout_preview_value" double precision,
	"last_checkout_ts" timestamp with time zone,
	"last_checkout_property" text,
	"last_checkout_property_id" text,
	"last_checkout_property_slug" text,
	"last_checkout_checkin" date,
	"last_checkout_checkout" date,
	"last_checkout_value" double precision,
	"last_payment_ts" timestamp with time zone,
	"last_payment_submit_ts" timestamp with time zone,
	"last_purchase_ts" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads"."hubspot_list_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"list_name" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"cohort" text NOT NULL,
	"domain_id" text,
	"contact_id" text,
	"imported_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads"."hubspot_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"subscription_type" text NOT NULL,
	"object_type_id" text,
	"portal_id" text,
	"object_id" text NOT NULL,
	"property_name" text,
	"property_value" text,
	"change_source" text,
	"attempt_number" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp,
	"process_note" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads"."lead_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"domain" text NOT NULL,
	"kind" "leads"."lead_channel_kind" NOT NULL,
	"value" text NOT NULL,
	"fields" jsonb,
	"vendor" text,
	"source" text,
	"confidence" real,
	"verified" boolean DEFAULT false NOT NULL,
	"delivery_state" "leads"."lead_channel_delivery_state" DEFAULT 'discovered' NOT NULL,
	"outreach_id" text,
	"reply_to_alias" text,
	"reply_token" text,
	"evidence" jsonb,
	"last_used_at" timestamp,
	"sent_at" timestamp,
	"replied_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "leads"."contact" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"domain" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"job_title" text,
	"phone" text,
	"state" text,
	"verification_status" text,
	"email_opt_out" boolean,
	"retired_at" timestamp,
	"retired_reason" text,
	"verification" jsonb,
	"hubspot_contact_id" text,
	"instantly_lead_id" text,
	"instantly_campaign_id" text,
	"pushed_to_instantly_at" timestamp,
	"email_open_count" integer DEFAULT 0 NOT NULL,
	"email_reply_count" integer DEFAULT 0 NOT NULL,
	"email_click_count" integer DEFAULT 0 NOT NULL,
	"interest_status" integer,
	"last_contacted_at" timestamp,
	"source" "leads"."lead_source",
	"raw" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "leads"."domain" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"company_name" text,
	"country" text,
	"state" text,
	"city" text,
	"pms" text,
	"platforms" jsonb,
	"platform_count" integer,
	"is_integrated_pms" boolean,
	"unit_count" integer,
	"website_quality" text,
	"pregen_site_url" text,
	"pregen_status" text,
	"pregen_page_title" text,
	"hubspot_record_id" text,
	"hubspot_lead_status" text,
	"hubspot_owner" text,
	"hubspot_synced_at" timestamp,
	"hubspot_last_modified_at" timestamp,
	"outreach_link" text,
	"has_hubspot_deal" boolean DEFAULT false NOT NULL,
	"is_existing_customer" boolean DEFAULT false NOT NULL,
	"source_tier" text,
	"in_builtwith" boolean DEFAULT false NOT NULL,
	"in_hubspot" boolean DEFAULT false NOT NULL,
	"in_pregen" boolean DEFAULT false NOT NULL,
	"in_instantly" boolean DEFAULT false NOT NULL,
	"has_phone" boolean DEFAULT false NOT NULL,
	"has_form" boolean DEFAULT false NOT NULL,
	"has_chatbot" boolean DEFAULT false NOT NULL,
	"unit_estimate" integer,
	"unit_low" integer,
	"unit_high" integer,
	"unit_confidence" text,
	"unit_basis" text,
	"unit_method" text,
	"unit_estimate_model" text,
	"unit_estimated_at" timestamp,
	"score_pregen_potential" real,
	"score_unit" real,
	"score_lead_quality" real,
	"score_composite" real,
	"computed_tier" "leads"."lead_tier",
	"score_version" text,
	"scored_at" timestamp,
	"pregen_batch" text,
	"exclude_from_outreach" boolean DEFAULT false NOT NULL,
	"exclude_reason" text,
	"enrichment" jsonb,
	"site_scrape" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "leads"."import" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"source" "leads"."lead_source" NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"domains_seen" integer DEFAULT 0 NOT NULL,
	"domains_created" integer DEFAULT 0 NOT NULL,
	"domains_updated" integer DEFAULT 0 NOT NULL,
	"contacts_created" integer DEFAULT 0 NOT NULL,
	"contacts_updated" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"imported_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads"."sequence" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"domain" text NOT NULL,
	"contact_id" text,
	"program_id" text,
	"status" "leads"."lead_outreach_status" DEFAULT 'draft' NOT NULL,
	"angle" text,
	"personalized_on" jsonb,
	"steps" jsonb,
	"model" text,
	"generation_context" jsonb,
	"instantly_campaign_id" text,
	"instantly_lead_id" text,
	"hubspot_sequence_id" text,
	"hubspot_enrollment_id" text,
	"enrolled_at" timestamp,
	"enrolled_by_email" text,
	"sent_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads"."meta_leadgen_lead" (
	"id" text PRIMARY KEY NOT NULL,
	"leadgen_id" text NOT NULL,
	"page_id" text NOT NULL,
	"form_id" text,
	"form_name" text,
	"ad_id" text,
	"campaign_name" text,
	"received_via" text NOT NULL,
	"lead_created_at" timestamp,
	"field_data" jsonb,
	"email" text,
	"units" integer,
	"qualified" boolean,
	"capi_sent_at" timestamp,
	"routed_at" timestamp,
	"last_error" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads"."pregen_build" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"domain" text NOT NULL,
	"prospect_id" text,
	"website_id" text,
	"preview_token" text,
	"business_name" text,
	"source_url" text,
	"status" text,
	"preview_url" text,
	"error_message" text,
	"requested_at" timestamp NOT NULL,
	"send_scheduled_for" date,
	"last_event_at" timestamp,
	"settled_at" timestamp,
	"claimed_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"first_viewed_at" timestamp,
	"last_viewed_at" timestamp,
	"last_alerted_at" timestamp,
	"assigned_owner_id" text,
	"assigned_at" timestamp,
	"verdict" "leads"."pregen_verdict",
	"verdict_at" timestamp,
	"verdict_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads"."sales_email_corpus" (
	"engagement_id" text PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"sent_at" timestamp NOT NULL,
	"rep" text,
	"counterpart_domain" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"word_count" integer NOT NULL,
	"is_reply" boolean DEFAULT false NOT NULL,
	"got_reply" boolean DEFAULT false NOT NULL,
	"reply_at" timestamp,
	"reply_engagement_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"channel_id" text,
	"program_id" text,
	"performance_cycle_id" text,
	"name" text NOT NULL,
	"description" text,
	"kind" "lifecycle_kind" DEFAULT 'other' NOT NULL,
	"run_state" "lifecycle_run_state" DEFAULT 'planned' NOT NULL,
	"external_kind" text,
	"trigger_event" text,
	"provider" "delivery_provider",
	"external_id" text,
	"external_url" text,
	"cleanup_status" "cleanup_status" DEFAULT 'keep' NOT NULL,
	"metrics" jsonb,
	"started_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lifecycle_program_step" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"name" text NOT NULL,
	"channel" "touchpoint_channel" DEFAULT 'email' NOT NULL,
	"status" "lifecycle_step_status" DEFAULT 'planned' NOT NULL,
	"system" "lifecycle_step_system",
	"position" integer DEFAULT 0 NOT NULL,
	"delay_minutes" integer,
	"delay_label" text,
	"subject" text,
	"body" text,
	"url" text,
	"parent_step_id" text,
	"branch_label" text,
	"campaign_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_program" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "lifecycle_kind" DEFAULT 'other' NOT NULL,
	"status" "lifecycle_program_status" DEFAULT 'planned' NOT NULL,
	"priority" "lifecycle_program_priority" DEFAULT 'should_have' NOT NULL,
	"workspace" "lifecycle_workspace" DEFAULT 'marketplace' NOT NULL,
	"intended_trigger" text,
	"intended_channels" jsonb,
	"target_touchpoints" integer,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lifecycle_touchpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text,
	"subject" text,
	"channel" "touchpoint_channel" DEFAULT 'email' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"delay_label" text,
	"external_id" text,
	"metrics" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"website" text,
	"plan" text,
	"status" "performance_account_status" DEFAULT 'prospect' NOT NULL,
	"notes" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "performance_application" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"website_url" text,
	"property_count" integer,
	"markets_today" text,
	"monthly_spend" text,
	"source" text NOT NULL,
	"query_params" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"period" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"billed_amount" integer,
	"media_budget" integer,
	"actual_spend_cents" integer,
	"actual_spend_at" timestamp with time zone,
	"fee_paid_at" timestamp with time zone,
	"media_paid_at" timestamp with time zone,
	"status" "performance_cycle_status" DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_intake" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"brand_id" text,
	"brand_slug" text,
	"status" "performance_intake_status" DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_name" text,
	"submitted_by_email" text,
	"answers" jsonb NOT NULL,
	"answers_fingerprint" text,
	"media_budget_dollars" integer,
	"budget_is_recommendation" boolean DEFAULT false NOT NULL,
	"guest_list_consent_at" timestamp with time zone,
	"billing_acknowledged_at" timestamp with time zone,
	"instagram_link_confirmed_at" timestamp with time zone,
	"access_claimed_at" timestamp with time zone,
	"zernio_verified_at" timestamp with time zone,
	"verified_page_id" text,
	"verified_ad_account_id" text,
	"verified_pixel_id" text,
	"applied_at" timestamp with time zone,
	"applied_by" text,
	"applied_summary" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_property" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"wander_url" text,
	"site_url" text,
	"property_id" text,
	"title" text,
	"city" text,
	"state" text,
	"country" text,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "performance_property_identified" CHECK ("performance_property"."wander_url" is not null or "performance_property"."site_url" is not null or "performance_property"."title" is not null)
);
--> statement-breakpoint
CREATE TABLE "performance_report" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" text NOT NULL,
	"account_id" text NOT NULL,
	"period_label" text NOT NULL,
	"token" text NOT NULL,
	"metrics" jsonb,
	"narrative" text,
	"recommendations" text,
	"status" "performance_report_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactional_message" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"description" text,
	"workspace" "lifecycle_workspace" DEFAULT 'marketplace' NOT NULL,
	"domain" "transactional_domain" DEFAULT 'other' NOT NULL,
	"criticality" "transactional_criticality" DEFAULT 'operational' NOT NULL,
	"trigger_kind" "transactional_trigger_kind" DEFAULT 'event' NOT NULL,
	"trigger_event" text,
	"trigger_anchor" text,
	"trigger_offset_minutes" integer,
	"trigger_label" text,
	"provider" "delivery_provider" DEFAULT 'customerio' NOT NULL,
	"provider_ref" jsonb,
	"code_refs" jsonb,
	"template_source" "transactional_template_source" DEFAULT 'cio_ui' NOT NULL,
	"template_key" text,
	"data_contract" jsonb,
	"preview_props" jsonb,
	"status" "transactional_status" DEFAULT 'live_legacy' NOT NULL,
	"linear_ref" text,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "listening_source" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"key" text NOT NULL,
	"platform" "channel_platform" NOT NULL,
	"acquisition" "acquisition_shape" NOT NULL,
	"trigger" "listening_trigger" NOT NULL,
	"schedule_cron" text,
	"adapter" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"voice_override" jsonb,
	"signal_notes" text,
	"channel_id" text,
	"label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_scan_at" timestamp,
	"next_scan_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mention" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'f5bot' NOT NULL,
	"source" text NOT NULL,
	"source_type" text,
	"external_id" text,
	"url" text NOT NULL,
	"keyword" text,
	"subreddit" text,
	"author" text,
	"title" text,
	"snippet" text,
	"posted_at" timestamp,
	"received_at" timestamp NOT NULL,
	"relevance" integer,
	"intent_tag" text,
	"suggested_action" text,
	"rationale" text,
	"ban_risk" real,
	"suggested_reply" text,
	"status" text DEFAULT 'new' NOT NULL,
	"assignee_id" text,
	"resolved_by_id" text,
	"resolved_at" timestamp,
	"reply_url" text,
	"reply_note" text,
	"decision_note" text,
	"slack_ts" text,
	"slack_channel" text,
	"source_email_id" text,
	"raw" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_media" (
	"id" text PRIMARY KEY NOT NULL,
	"home_id" text NOT NULL,
	"asset_id" text,
	"source_url" text,
	"thumb_url" text,
	"role" "home_media_role" DEFAULT 'gallery' NOT NULL,
	"sort_order" integer,
	"focal_x" integer,
	"focal_y" integer,
	"added_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"source" "home_source" DEFAULT 'wanderos' NOT NULL,
	"external_id" text NOT NULL,
	"property_id" text,
	"url" text NOT NULL,
	"url_key" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"country" text,
	"bedrooms" integer,
	"bathrooms" real,
	"guests" integer,
	"rating" real,
	"nightly_from" integer,
	"review_count" integer,
	"tier" text,
	"management" text,
	"cheapest_stay" jsonb,
	"hero_source_url" text,
	"featured" boolean DEFAULT false NOT NULL,
	"amenities" jsonb,
	"description" text,
	"ai_notes" jsonb,
	"catalog_title" text,
	"catalog_subtitle" text,
	"catalog_template_id" text,
	"catalog_image_position" text,
	"catalog_show_logo" boolean,
	"catalog_image_asset_id" text,
	"catalog_mode" text,
	"catalog_finished_asset_id" text,
	"catalog_excluded" boolean DEFAULT false NOT NULL,
	"catalog_pills" jsonb,
	"catalog_approval" jsonb,
	"gallery_cache" jsonb,
	"sort_order" integer,
	"synced_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "media_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"folder_id" text,
	"uploaded_by" text,
	"source_platform_post_id" text,
	"source_media_index" integer,
	"provider" "media_provider" NOT NULL,
	"kind" "media_kind" NOT NULL,
	"status" "media_status" DEFAULT 'uploading' NOT NULL,
	"review_status" "media_review_status" DEFAULT 'approved' NOT NULL,
	"discovered_source_url" text,
	"title" text,
	"alt" text,
	"tags" jsonb,
	"filename" text,
	"mime_type" text,
	"size" integer,
	"r2_key" text,
	"url" text,
	"stream_uid" text,
	"external_url" text,
	"source_provider" text,
	"thumbnail_url" text,
	"width" integer,
	"height" integer,
	"duration" integer,
	"storyboard" jsonb,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "media_asset_tag" (
	"media_asset_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"source" "media_tag_source" NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "media_asset_tag_media_asset_id_tag_id_source_pk" PRIMARY KEY("media_asset_id","tag_id","source")
);
--> statement-breakpoint
CREATE TABLE "media_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_video_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"platform_post_id" text NOT NULL,
	"source_media_index" integer NOT NULL,
	"source_url" text NOT NULL,
	"status" "media_video_analysis_status" DEFAULT 'processing' NOT NULL,
	"renderer_version" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer,
	"sample_interval_ms" integer,
	"grid_size" integer,
	"frame_count" integer,
	"boards" jsonb,
	"frames" jsonb,
	"transcript_language" text,
	"transcript_text" text,
	"transcript_words" jsonb,
	"transcript_error" text,
	"analysis" jsonb,
	"error" text,
	"created_by" text,
	"artifacts_saved_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregen_native_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"pages" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregen_native_build" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"status" "pregen_native_build_status" DEFAULT 'queued' NOT NULL,
	"current_step" "pregen_native_build_step",
	"step_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"extracted_properties" jsonb,
	"brand_kit" jsonb,
	"draft_config" jsonb,
	"draft_pages" jsonb,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregen_native_crawl_page" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"url" text NOT NULL,
	"kind" "pregen_native_crawl_page_kind" DEFAULT 'other' NOT NULL,
	"markdown" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregen_native_evaluation_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"evaluator_type" text NOT NULL,
	"evaluator_name" text NOT NULL,
	"evaluator_version" text NOT NULL,
	"model" text,
	"input_refs" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregen_native_prospect" (
	"id" text PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"status" "pregen_native_prospect_status" DEFAULT 'new' NOT NULL,
	"preview_token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_page" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"path" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"page_type" "web_page_type" NOT NULL,
	"location_slug" text,
	"city_slug" text,
	"category_slug" text,
	"description" text,
	"og_image" text,
	"lastmod_at" timestamp,
	"first_seen_at" timestamp NOT NULL,
	"last_seen_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "booking_target" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"home_group_id" text,
	"home_id" text,
	"check_in" text,
	"check_out" text,
	"guests" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_group_member" (
	"group_id" text NOT NULL,
	"home_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "home_group_member_group_id_home_id_pk" PRIMARY KEY("group_id","home_id")
);
--> statement-breakpoint
CREATE TABLE "home_group" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "home_group_kind" DEFAULT 'custom' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_page_view" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"surface" text NOT NULL,
	"visit_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_page_view_surface_check" CHECK ("client_page_view"."surface" in ('pitch','intake','social_connect','email_dns'))
);
--> statement-breakpoint
CREATE TABLE "email_audience_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"audience_id" text NOT NULL,
	"revision" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"query_sql" text NOT NULL,
	"query_hash" text NOT NULL,
	"job_id" text NOT NULL,
	"table_id" text NOT NULL,
	"status" text DEFAULT 'compiling' NOT NULL,
	"recipient_count" integer,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_audience" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiative_member" (
	"id" text PRIMARY KEY NOT NULL,
	"initiative_id" text NOT NULL,
	"content_post_id" text,
	"series_id" text,
	"campaign_id" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "initiative_member_one_target" CHECK (num_nonnulls("initiative_member"."content_post_id", "initiative_member"."series_id", "initiative_member"."campaign_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "initiative" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_brand_id" text,
	"owner_id" text,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "initiative_status_check" CHECK ("initiative"."status" IN ('planned', 'active', 'paused', 'completed', 'archived')),
	CONSTRAINT "initiative_dates_check" CHECK ("initiative"."end_at" IS NULL OR "initiative"."start_at" IS NULL OR "initiative"."end_at" >= "initiative"."start_at")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_team_id_team_id_fk" FOREIGN KEY ("active_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access" ADD CONSTRAINT "access_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access" ADD CONSTRAINT "access_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_inspiration" ADD CONSTRAINT "brand_inspiration_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_inspiration" ADD CONSTRAINT "brand_inspiration_inspiration_brand_id_brand_id_fk" FOREIGN KEY ("inspiration_brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand" ADD CONSTRAINT "brand_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand" ADD CONSTRAINT "brand_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona" ADD CONSTRAINT "persona_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_pitch" ADD CONSTRAINT "brand_pitch_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_pitch" ADD CONSTRAINT "brand_pitch_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_suggestion" ADD CONSTRAINT "channel_suggestion_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_suggestion" ADD CONSTRAINT "channel_suggestion_accepted_channel_id_channel_id_fk" FOREIGN KEY ("accepted_channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_suggestion" ADD CONSTRAINT "channel_suggestion_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assignee" ADD CONSTRAINT "content_assignee_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assignee" ADD CONSTRAINT "content_assignee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_comment" ADD CONSTRAINT "content_comment_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_comment" ADD CONSTRAINT "content_comment_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_comment" ADD CONSTRAINT "content_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ingest_run" ADD CONSTRAINT "content_ingest_run_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ingest_run" ADD CONSTRAINT "content_ingest_run_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suggestion" ADD CONSTRAINT "content_suggestion_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suggestion" ADD CONSTRAINT "content_suggestion_subject_post_id_platform_post_id_fk" FOREIGN KEY ("subject_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suggestion" ADD CONSTRAINT "content_suggestion_target_post_id_platform_post_id_fk" FOREIGN KEY ("target_post_id") REFERENCES "public"."platform_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suggestion" ADD CONSTRAINT "content_suggestion_applied_link_id_platform_post_link_id_fk" FOREIGN KEY ("applied_link_id") REFERENCES "public"."platform_post_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suggestion" ADD CONSTRAINT "content_suggestion_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_post_link" ADD CONSTRAINT "platform_post_link_from_platform_post_id_platform_post_id_fk" FOREIGN KEY ("from_platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_post_link" ADD CONSTRAINT "platform_post_link_to_platform_post_id_platform_post_id_fk" FOREIGN KEY ("to_platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_post" ADD CONSTRAINT "platform_post_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_post" ADD CONSTRAINT "platform_post_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_post" ADD CONSTRAINT "platform_post_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_post" ADD CONSTRAINT "platform_post_parent_platform_post_id_platform_post_id_fk" FOREIGN KEY ("parent_platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_post" ADD CONSTRAINT "platform_post_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pillar" ADD CONSTRAINT "content_pillar_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_input" ADD CONSTRAINT "assistant_input_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_input" ADD CONSTRAINT "assistant_input_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_run" ADD CONSTRAINT "assistant_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_run" ADD CONSTRAINT "assistant_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_run" ADD CONSTRAINT "assistant_run_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_thread" ADD CONSTRAINT "assistant_thread_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_thread" ADD CONSTRAINT "assistant_thread_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_thread" ADD CONSTRAINT "assistant_thread_pinned_brand_id_brand_id_fk" FOREIGN KEY ("pinned_brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_thread" ADD CONSTRAINT "assistant_thread_active_content_post_id_content_post_id_fk" FOREIGN KEY ("active_content_post_id") REFERENCES "public"."content_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_tool_receipt" ADD CONSTRAINT "assistant_tool_receipt_run_id_assistant_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."assistant_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_tool_receipt" ADD CONSTRAINT "assistant_tool_receipt_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_source_run_id_workflow_run_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_export" ADD CONSTRAINT "catalog_export_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_document" ADD CONSTRAINT "platform_document_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_document" ADD CONSTRAINT "platform_document_document_id_production_packet_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."production_packet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_packet" ADD CONSTRAINT "production_packet_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_packet" ADD CONSTRAINT "production_packet_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_packet" ADD CONSTRAINT "production_packet_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_packet" ADD CONSTRAINT "production_packet_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_packet" ADD CONSTRAINT "production_packet_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_thread_id_assistant_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_packet_id_production_packet_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."production_packet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_accepted_media_asset_id_media_asset_id_fk" FOREIGN KEY ("accepted_media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_parent_run_id_workflow_run_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_retry_of_id_workflow_run_id_fk" FOREIGN KEY ("retry_of_id") REFERENCES "public"."workflow_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_document_id_production_packet_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."production_packet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_manager_user_id_user_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_reference" ADD CONSTRAINT "storefront_reference_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_reference" ADD CONSTRAINT "storefront_reference_reference_brand_id_brand_id_fk" FOREIGN KEY ("reference_brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_reference" ADD CONSTRAINT "storefront_reference_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront" ADD CONSTRAINT "storefront_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront" ADD CONSTRAINT "storefront_manager_user_id_user_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront" ADD CONSTRAINT "storefront_stale_marked_by_user_id_fk" FOREIGN KEY ("stale_marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront" ADD CONSTRAINT "storefront_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_home_id_home_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."home"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_booking_target_id_booking_target_id_fk" FOREIGN KEY ("booking_target_id") REFERENCES "public"."booking_target"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience" ADD CONSTRAINT "audience_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience" ADD CONSTRAINT "audience_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience" ADD CONSTRAINT "audience_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_asset" ADD CONSTRAINT "campaign_audience_asset_audience_id_audience_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_asset" ADD CONSTRAINT "campaign_audience_asset_platform_audience_id_platform_audience_id_fk" FOREIGN KEY ("platform_audience_id") REFERENCES "public"."platform_audience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_booking_target_id_booking_target_id_fk" FOREIGN KEY ("booking_target_id") REFERENCES "public"."booking_target"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_performance_cycle_id_performance_cycle_id_fk" FOREIGN KEY ("performance_cycle_id") REFERENCES "public"."performance_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad_set" ADD CONSTRAINT "platform_ad_set_platform_campaign_id_platform_campaign_id_fk" FOREIGN KEY ("platform_campaign_id") REFERENCES "public"."platform_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad_set" ADD CONSTRAINT "platform_ad_set_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad_set" ADD CONSTRAINT "platform_ad_set_audience_id_audience_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audience"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad" ADD CONSTRAINT "platform_ad_platform_campaign_id_platform_campaign_id_fk" FOREIGN KEY ("platform_campaign_id") REFERENCES "public"."platform_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad" ADD CONSTRAINT "platform_ad_platform_ad_set_id_platform_ad_set_id_fk" FOREIGN KEY ("platform_ad_set_id") REFERENCES "public"."platform_ad_set"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad" ADD CONSTRAINT "platform_ad_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad" ADD CONSTRAINT "platform_ad_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ad" ADD CONSTRAINT "platform_ad_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audience" ADD CONSTRAINT "platform_audience_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audience" ADD CONSTRAINT "platform_audience_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audience" ADD CONSTRAINT "platform_audience_audience_id_audience_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audience"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audience" ADD CONSTRAINT "platform_audience_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_campaign" ADD CONSTRAINT "platform_campaign_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_campaign" ADD CONSTRAINT "platform_campaign_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_campaign" ADD CONSTRAINT "platform_campaign_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_item" ADD CONSTRAINT "affiliate_item_program_id_partner_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."partner_program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_item" ADD CONSTRAINT "affiliate_item_partner_id_affiliate_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_item" ADD CONSTRAINT "affiliate_item_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_item" ADD CONSTRAINT "affiliate_item_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_metric_daily" ADD CONSTRAINT "affiliate_metric_daily_program_id_partner_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."partner_program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_metric_daily" ADD CONSTRAINT "affiliate_metric_daily_partner_id_affiliate_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_partner" ADD CONSTRAINT "affiliate_partner_program_id_partner_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."partner_program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_program" ADD CONSTRAINT "partner_program_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_event" ADD CONSTRAINT "conversion_event_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_mapping_source" ADD CONSTRAINT "conversion_mapping_source_mapping_id_conversion_mapping_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."conversion_mapping"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_mapping_source" ADD CONSTRAINT "conversion_mapping_source_conversion_event_id_conversion_event_id_fk" FOREIGN KEY ("conversion_event_id") REFERENCES "public"."conversion_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_mapping" ADD CONSTRAINT "conversion_mapping_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_mapping" ADD CONSTRAINT "conversion_mapping_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_mapping" ADD CONSTRAINT "conversion_mapping_ad_account_id_ad_account_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amplification_target" ADD CONSTRAINT "amplification_target_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amplification_target" ADD CONSTRAINT "amplification_target_amplifier_id_amplifier_id_fk" FOREIGN KEY ("amplifier_id") REFERENCES "public"."amplifier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amplification_target" ADD CONSTRAINT "amplification_target_output_platform_post_id_platform_post_id_fk" FOREIGN KEY ("output_platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amplification_target" ADD CONSTRAINT "amplification_target_performance_cycle_id_performance_cycle_id_fk" FOREIGN KEY ("performance_cycle_id") REFERENCES "public"."performance_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amplifier" ADD CONSTRAINT "amplifier_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amplifier" ADD CONSTRAINT "amplifier_linked_brand_id_brand_id_fk" FOREIGN KEY ("linked_brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_target" ADD CONSTRAINT "cadence_target_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_target" ADD CONSTRAINT "cadence_target_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_target" ADD CONSTRAINT "cadence_target_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_target" ADD CONSTRAINT "mix_target_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_target" ADD CONSTRAINT "mix_target_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."hubspot_list_membership" ADD CONSTRAINT "hubspot_list_membership_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "leads"."domain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."hubspot_list_membership" ADD CONSTRAINT "hubspot_list_membership_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "leads"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."lead_channel" ADD CONSTRAINT "lead_channel_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "leads"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."lead_channel" ADD CONSTRAINT "lead_channel_outreach_id_sequence_id_fk" FOREIGN KEY ("outreach_id") REFERENCES "leads"."sequence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."contact" ADD CONSTRAINT "contact_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "leads"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."import" ADD CONSTRAINT "import_imported_by_user_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."sequence" ADD CONSTRAINT "sequence_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "leads"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."sequence" ADD CONSTRAINT "sequence_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "leads"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads"."pregen_build" ADD CONSTRAINT "pregen_build_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "leads"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_campaign" ADD CONSTRAINT "lifecycle_campaign_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_campaign" ADD CONSTRAINT "lifecycle_campaign_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_campaign" ADD CONSTRAINT "lifecycle_campaign_program_id_lifecycle_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."lifecycle_program"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_campaign" ADD CONSTRAINT "lifecycle_campaign_performance_cycle_id_performance_cycle_id_fk" FOREIGN KEY ("performance_cycle_id") REFERENCES "public"."performance_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_program_step" ADD CONSTRAINT "lifecycle_program_step_program_id_lifecycle_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."lifecycle_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_program_step" ADD CONSTRAINT "lifecycle_program_step_parent_step_id_lifecycle_program_step_id_fk" FOREIGN KEY ("parent_step_id") REFERENCES "public"."lifecycle_program_step"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_program_step" ADD CONSTRAINT "lifecycle_program_step_campaign_id_lifecycle_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."lifecycle_campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_program" ADD CONSTRAINT "lifecycle_program_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_touchpoint" ADD CONSTRAINT "lifecycle_touchpoint_campaign_id_lifecycle_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."lifecycle_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_account" ADD CONSTRAINT "performance_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_account" ADD CONSTRAINT "performance_account_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_cycle" ADD CONSTRAINT "performance_cycle_account_id_performance_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."performance_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_intake" ADD CONSTRAINT "performance_intake_account_id_performance_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."performance_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_intake" ADD CONSTRAINT "performance_intake_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_property" ADD CONSTRAINT "performance_property_account_id_performance_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."performance_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_report" ADD CONSTRAINT "performance_report_cycle_id_performance_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."performance_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_report" ADD CONSTRAINT "performance_report_account_id_performance_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."performance_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactional_message" ADD CONSTRAINT "transactional_message_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_source" ADD CONSTRAINT "listening_source_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_source" ADD CONSTRAINT "listening_source_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_media" ADD CONSTRAINT "home_media_home_id_home_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."home"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_media" ADD CONSTRAINT "home_media_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_media" ADD CONSTRAINT "home_media_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home" ADD CONSTRAINT "home_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home" ADD CONSTRAINT "home_catalog_image_asset_id_media_asset_id_fk" FOREIGN KEY ("catalog_image_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home" ADD CONSTRAINT "home_catalog_finished_asset_id_media_asset_id_fk" FOREIGN KEY ("catalog_finished_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_folder_id_media_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_source_platform_post_id_platform_post_id_fk" FOREIGN KEY ("source_platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_tag" ADD CONSTRAINT "media_asset_tag_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_tag" ADD CONSTRAINT "media_asset_tag_tag_id_media_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."media_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tag" ADD CONSTRAINT "media_tag_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_video_analysis" ADD CONSTRAINT "media_video_analysis_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_video_analysis" ADD CONSTRAINT "media_video_analysis_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_video_analysis" ADD CONSTRAINT "media_video_analysis_platform_post_id_platform_post_id_fk" FOREIGN KEY ("platform_post_id") REFERENCES "public"."platform_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_video_analysis" ADD CONSTRAINT "media_video_analysis_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregen_native_artifact" ADD CONSTRAINT "pregen_native_artifact_build_id_pregen_native_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."pregen_native_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregen_native_artifact" ADD CONSTRAINT "pregen_native_artifact_prospect_id_pregen_native_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."pregen_native_prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregen_native_build" ADD CONSTRAINT "pregen_native_build_prospect_id_pregen_native_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."pregen_native_prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregen_native_crawl_page" ADD CONSTRAINT "pregen_native_crawl_page_build_id_pregen_native_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."pregen_native_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregen_native_evaluation_receipt" ADD CONSTRAINT "pregen_native_evaluation_receipt_build_id_pregen_native_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."pregen_native_build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_page" ADD CONSTRAINT "web_page_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_target" ADD CONSTRAINT "booking_target_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_target" ADD CONSTRAINT "booking_target_home_group_id_home_group_id_fk" FOREIGN KEY ("home_group_id") REFERENCES "public"."home_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_target" ADD CONSTRAINT "booking_target_home_id_home_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."home"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_group_member" ADD CONSTRAINT "home_group_member_group_id_home_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."home_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_group_member" ADD CONSTRAINT "home_group_member_home_id_home_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."home"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_group" ADD CONSTRAINT "home_group_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_page_view" ADD CONSTRAINT "client_page_view_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_audience_snapshot" ADD CONSTRAINT "email_audience_snapshot_audience_id_email_audience_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."email_audience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_audience" ADD CONSTRAINT "email_audience_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_member" ADD CONSTRAINT "initiative_member_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_member" ADD CONSTRAINT "initiative_member_content_post_id_content_post_id_fk" FOREIGN KEY ("content_post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_member" ADD CONSTRAINT "initiative_member_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_member" ADD CONSTRAINT "initiative_member_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_lead_brand_id_brand_id_fk" FOREIGN KEY ("lead_brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_org_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_org_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_composite_idx" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "org_slug_idx" ON "organization" USING btree ("slug") WHERE "organization"."slug" IS NOT NULL AND "organization"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_member_team_id_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_member_user_id_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_member_composite_idx" ON "team_member" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_org_id_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_session_id_idx" ON "oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_client_id_idx" ON "oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_id_idx" ON "oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_account_brand_idx" ON "ad_account" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_account_platform_external_brand_idx" ON "ad_account" USING btree ("platform","external_id","brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_account_platform_external_unbranded_idx" ON "ad_account" USING btree ("platform","external_id") WHERE "ad_account"."brand_id" IS NULL;--> statement-breakpoint
CREATE INDEX "access_brand_idx" ON "access" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "access_subject_idx" ON "access" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_unique_idx" ON "access" USING btree ("brand_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "brand_inspiration_brand_idx" ON "brand_inspiration" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_inspiration_inspiration_idx" ON "brand_inspiration" USING btree ("inspiration_brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_inspiration_pair_idx" ON "brand_inspiration" USING btree ("brand_id","inspiration_brand_id");--> statement-breakpoint
CREATE INDEX "brand_org_id_idx" ON "brand" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "brand_owner_id_idx" ON "brand" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "brand_type_idx" ON "brand" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_org_slug_idx" ON "brand" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_zernio_profile_idx" ON "brand" USING btree ("zernio_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_connect_token_idx" ON "brand" USING btree ("connect_token");--> statement-breakpoint
CREATE INDEX "persona_brand_idx" ON "persona" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "channel_suggestion_brand_idx" ON "channel_suggestion" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "channel_suggestion_status_idx" ON "channel_suggestion" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_suggestion_unique_idx" ON "channel_suggestion" USING btree ("brand_id","platform","handle");--> statement-breakpoint
CREATE INDEX "channel_brand_idx" ON "channel" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "channel_kind_idx" ON "channel" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "channel_platform_idx" ON "channel" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "channel_connection_status_idx" ON "channel" USING btree ("connection_status");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_zernio_account_idx" ON "channel" USING btree ("external_id") WHERE "channel"."default_provider" = 'zernio' AND "channel"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "content_assignee_user_idx" ON "content_assignee" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_comment_content_idx" ON "content_comment" USING btree ("content_post_id");--> statement-breakpoint
CREATE INDEX "content_comment_platform_idx" ON "content_comment" USING btree ("platform_post_id");--> statement-breakpoint
CREATE INDEX "content_ingest_run_brand_idx" ON "content_ingest_run" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_ingest_run_started_idx" ON "content_ingest_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "content_post_brand_idx" ON "content_post" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_post_owner_idx" ON "content_post" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "content_post_status_idx" ON "content_post" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_post_pillar_idx" ON "content_post" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "content_post_series_idx" ON "content_post" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "content_post_planned_at_idx" ON "content_post" USING btree ("planned_at");--> statement-breakpoint
CREATE INDEX "content_suggestion_brand_idx" ON "content_suggestion" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_suggestion_subject_idx" ON "content_suggestion" USING btree ("subject_post_id");--> statement-breakpoint
CREATE INDEX "content_suggestion_status_idx" ON "content_suggestion" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_suggestion_kind_idx" ON "content_suggestion" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "platform_post_link_from_idx" ON "platform_post_link" USING btree ("from_platform_post_id");--> statement-breakpoint
CREATE INDEX "platform_post_link_to_idx" ON "platform_post_link" USING btree ("to_platform_post_id");--> statement-breakpoint
CREATE INDEX "platform_post_brand_idx" ON "platform_post" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "platform_post_content_post_idx" ON "platform_post" USING btree ("content_post_id");--> statement-breakpoint
CREATE INDEX "platform_post_channel_idx" ON "platform_post" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "platform_post_platform_username_idx" ON "platform_post" USING btree ("platform","username");--> statement-breakpoint
CREATE INDEX "platform_post_source_idx" ON "platform_post" USING btree ("source");--> statement-breakpoint
CREATE INDEX "platform_post_status_idx" ON "platform_post" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_post_scheduled_at_idx" ON "platform_post" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "platform_post_published_at_idx" ON "platform_post" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "platform_post_cleanup_idx" ON "platform_post" USING btree ("cleanup_status");--> statement-breakpoint
CREATE INDEX "platform_post_external_idx" ON "platform_post" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "platform_post_delivery_external_idx" ON "platform_post" USING btree ("provider","delivery_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_post_canonical_external_idx" ON "platform_post" USING btree ("brand_id","platform","external_id") WHERE "platform_post"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_post_parent_idx" ON "platform_post" USING btree ("parent_platform_post_id");--> statement-breakpoint
CREATE INDEX "platform_post_cadence_idx" ON "platform_post" USING btree ("brand_id","archetype","published_at");--> statement-breakpoint
CREATE INDEX "series_brand_idx" ON "series" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "series_status_idx" ON "series" USING btree ("status");--> statement-breakpoint
CREATE INDEX "series_pillar_idx" ON "series" USING btree ("brand_id","pillar");--> statement-breakpoint
CREATE INDEX "content_pillar_brand_idx" ON "content_pillar" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pillar_brand_slug_idx" ON "content_pillar" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "assistant_input_thread_sequence_idx" ON "assistant_input" USING btree ("thread_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_message_thread_client_id_idx" ON "assistant_message" USING btree ("thread_id","client_message_id");--> statement-breakpoint
CREATE INDEX "assistant_message_thread_created_idx" ON "assistant_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_run_org_started_idx" ON "assistant_run" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "assistant_run_thread_started_idx" ON "assistant_run" USING btree ("thread_id","started_at");--> statement-breakpoint
CREATE INDEX "assistant_thread_org_updated_idx" ON "assistant_thread" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "assistant_thread_created_by_idx" ON "assistant_thread" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "assistant_thread_brand_idx" ON "assistant_thread" USING btree ("pinned_brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_tool_receipt_run_call_uidx" ON "assistant_tool_receipt" USING btree ("run_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "assistant_tool_receipt_run_idx" ON "assistant_tool_receipt" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "catalog_export_brand_idx" ON "catalog_export" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "production_packet_brand_idx" ON "production_packet" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "production_packet_content_idx" ON "production_packet" USING btree ("content_post_id");--> statement-breakpoint
CREATE INDEX "production_packet_thread_idx" ON "production_packet" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_active_packet_idx" ON "workflow_run" USING btree ("packet_id") WHERE "workflow_run"."packet_id" IS NOT NULL AND "workflow_run"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "workflow_run_brand_idx" ON "workflow_run" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_run_queue_idx" ON "workflow_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_active_resource_idx" ON "workflow_run" USING btree ("organization_id","lock_key") WHERE "workflow_run"."lock_key" IS NOT NULL AND "workflow_run"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "workflow_run_packet_idx" ON "workflow_run" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "workflow_run_thread_idx" ON "workflow_run" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_provider_request_idx" ON "workflow_run" USING btree ("provider","provider_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_send_idempotency_idx" ON "message_send" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "message_send_document_idx" ON "message_send" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "message_send_status_idx" ON "message_send" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_send_platform_post_idx" ON "message_send" USING btree ("platform_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "postmark_event_dedupe_idx" ON "postmark_event" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "postmark_event_recipient_idx" ON "postmark_event" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "postmark_event_message_idx" ON "postmark_event" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "postmark_event_server_type_idx" ON "postmark_event" USING btree ("server_id","record_type","occurred_at");--> statement-breakpoint
CREATE INDEX "product_org_idx" ON "product" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "product_brand_idx" ON "product" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "product_manager_idx" ON "product" USING btree ("manager_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_org_slug_active_idx" ON "product" USING btree ("organization_id","slug") WHERE "product"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "storefront_reference_storefront_idx" ON "storefront_reference" USING btree ("storefront_id");--> statement-breakpoint
CREATE INDEX "storefront_reference_brand_idx" ON "storefront_reference" USING btree ("reference_brand_id");--> statement-breakpoint
CREATE INDEX "storefront_reference_observed_idx" ON "storefront_reference" USING btree ("storefront_id","observed_at");--> statement-breakpoint
CREATE INDEX "storefront_product_idx" ON "storefront" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "storefront_manager_idx" ON "storefront" USING btree ("manager_user_id");--> statement-breakpoint
CREATE INDEX "storefront_freshness_idx" ON "storefront" USING btree ("freshness_status");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_product_surface_active_idx" ON "storefront" USING btree ("product_id","surface") WHERE "storefront"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ad_campaign_idx" ON "ad" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_brand_idx" ON "ad" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_business_key_idx" ON "ad" USING btree ("business_key") WHERE "ad"."business_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audience_campaign_idx" ON "audience" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "audience_brand_idx" ON "audience" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "audience_persona_idx" ON "audience" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_audience_asset_platform_idx" ON "campaign_audience_asset" USING btree ("audience_id","platform");--> statement-breakpoint
CREATE INDEX "campaign_audience_asset_asset_idx" ON "campaign_audience_asset" USING btree ("platform_audience_id");--> statement-breakpoint
CREATE INDEX "campaign_brand_idx" ON "campaign" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "campaign_status_idx" ON "campaign" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_performance_cycle_idx" ON "campaign" USING btree ("performance_cycle_id");--> statement-breakpoint
CREATE INDEX "platform_ad_set_campaign_idx" ON "platform_ad_set" USING btree ("platform_campaign_id");--> statement-breakpoint
CREATE INDEX "platform_ad_set_audience_idx" ON "platform_ad_set" USING btree ("audience_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_ad_set_external_id_idx" ON "platform_ad_set" USING btree ("external_id") WHERE "platform_ad_set"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_ad_campaign_idx" ON "platform_ad" USING btree ("platform_campaign_id");--> statement-breakpoint
CREATE INDEX "platform_ad_set_idx" ON "platform_ad" USING btree ("platform_ad_set_id");--> statement-breakpoint
CREATE INDEX "platform_ad_brand_idx" ON "platform_ad" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "platform_ad_status_idx" ON "platform_ad" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_ad_plan_idx" ON "platform_ad" USING btree ("ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_ad_external_id_idx" ON "platform_ad" USING btree ("external_id") WHERE "platform_ad"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_audience_brand_idx" ON "platform_audience" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "platform_audience_channel_idx" ON "platform_audience" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "platform_audience_plan_idx" ON "platform_audience" USING btree ("audience_id");--> statement-breakpoint
CREATE INDEX "platform_audience_persona_idx" ON "platform_audience" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_audience_external_id_idx" ON "platform_audience" USING btree ("channel_id","external_id") WHERE "platform_audience"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_campaign_brand_idx" ON "platform_campaign" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "platform_campaign_channel_idx" ON "platform_campaign" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "platform_campaign_status_idx" ON "platform_campaign" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_campaign_campaign_idx" ON "platform_campaign" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_item_dedup_uq" ON "affiliate_item" USING btree ("program_id","dedup_key");--> statement-breakpoint
CREATE INDEX "affiliate_item_status_idx" ON "affiliate_item" USING btree ("status");--> statement-breakpoint
CREATE INDEX "affiliate_item_kind_idx" ON "affiliate_item" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "affiliate_item_thread_idx" ON "affiliate_item" USING btree ("thread_key");--> statement-breakpoint
CREATE INDEX "affiliate_metric_program_date_idx" ON "affiliate_metric_daily" USING btree ("program_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_partner_program_external_uq" ON "affiliate_partner" USING btree ("program_id","external_id");--> statement-breakpoint
CREATE INDEX "affiliate_partner_state_idx" ON "affiliate_partner" USING btree ("state");--> statement-breakpoint
CREATE INDEX "partner_program_brand_idx" ON "partner_program" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "conversion_event_brand_idx" ON "conversion_event" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "conversion_event_funnel_idx" ON "conversion_event" USING btree ("funnel");--> statement-breakpoint
CREATE INDEX "conversion_mapping_source_event_idx" ON "conversion_mapping_source" USING btree ("conversion_event_id");--> statement-breakpoint
CREATE INDEX "conversion_mapping_brand_idx" ON "conversion_mapping" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "conversion_mapping_platform_idx" ON "conversion_mapping" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "conversion_mapping_channel_idx" ON "conversion_mapping" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "conversion_mapping_status_idx" ON "conversion_mapping" USING btree ("status");--> statement-breakpoint
CREATE INDEX "amplification_target_post_idx" ON "amplification_target" USING btree ("platform_post_id");--> statement-breakpoint
CREATE INDEX "amplification_target_performance_cycle_idx" ON "amplification_target" USING btree ("performance_cycle_id");--> statement-breakpoint
CREATE INDEX "amplification_target_amplifier_idx" ON "amplification_target" USING btree ("amplifier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amplification_target_unique_idx" ON "amplification_target" USING btree ("platform_post_id","amplifier_id","destination_platform","action_kind");--> statement-breakpoint
CREATE INDEX "amplifier_org_idx" ON "amplifier" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "amplifier_type_idx" ON "amplifier" USING btree ("type");--> statement-breakpoint
CREATE INDEX "cadence_target_brand_idx" ON "cadence_target" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "cadence_target_channel_idx" ON "cadence_target" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "cadence_target_series_idx" ON "cadence_target" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "mix_target_brand_idx" ON "mix_target" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mix_target_unique_idx" ON "mix_target" USING btree ("brand_id","pillar","period") WHERE channel_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "mix_target_channel_unique_idx" ON "mix_target" USING btree ("channel_id","pillar","period") WHERE channel_id is not null;--> statement-breakpoint
CREATE INDEX "funnel_drift_log_user_idx" ON "funnel_drift_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "funnel_drift_log_detected_at_idx" ON "funnel_drift_log" USING btree ("detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_send_log_episode_idx" ON "funnel_send_log" USING btree ("user_id","stage","window_key");--> statement-breakpoint
CREATE INDEX "funnel_send_log_sent_at_idx" ON "funnel_send_log" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "funnel_send_log_email_idx" ON "funnel_send_log" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_state_user_idx" ON "funnel_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "funnel_state_email_idx" ON "funnel_state" USING btree ("email");--> statement-breakpoint
CREATE INDEX "funnel_state_checkout_property_idx" ON "funnel_state" USING btree ("last_checkout_property_id");--> statement-breakpoint
CREATE INDEX "funnel_state_wishlist_property_idx" ON "funnel_state" USING btree ("last_wishlist_property_id");--> statement-breakpoint
CREATE INDEX "funnel_state_last_search_ts_idx" ON "funnel_state" USING btree ("last_search_ts");--> statement-breakpoint
CREATE INDEX "funnel_state_last_wishlist_ts_idx" ON "funnel_state" USING btree ("last_wishlist_ts");--> statement-breakpoint
CREATE INDEX "funnel_state_last_reserve_click_ts_idx" ON "funnel_state" USING btree ("last_reserve_click_ts");--> statement-breakpoint
CREATE INDEX "funnel_state_last_checkout_preview_ts_idx" ON "funnel_state" USING btree ("last_checkout_preview_ts");--> statement-breakpoint
CREATE INDEX "funnel_state_last_checkout_ts_idx" ON "funnel_state" USING btree ("last_checkout_ts");--> statement-breakpoint
CREATE INDEX "funnel_state_last_payment_ts_idx" ON "funnel_state" USING btree ("last_payment_ts");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_list_membership_list_object_idx" ON "leads"."hubspot_list_membership" USING btree ("list_id","object_id");--> statement-breakpoint
CREATE INDEX "hubspot_list_membership_domain_idx" ON "leads"."hubspot_list_membership" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "hubspot_list_membership_contact_idx" ON "leads"."hubspot_list_membership" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "hubspot_list_membership_cohort_type_idx" ON "leads"."hubspot_list_membership" USING btree ("cohort","object_type");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_webhook_event_event_id_idx" ON "leads"."hubspot_webhook_event" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "hubspot_webhook_event_object_idx" ON "leads"."hubspot_webhook_event" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "hubspot_webhook_event_pending_idx" ON "leads"."hubspot_webhook_event" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "hubspot_webhook_event_type_idx" ON "leads"."hubspot_webhook_event" USING btree ("subscription_type");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_channel_domain_kind_value_idx" ON "leads"."lead_channel" USING btree ("domain_id","kind","value");--> statement-breakpoint
CREATE INDEX "lead_channel_domain_id_idx" ON "leads"."lead_channel" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "lead_channel_kind_idx" ON "leads"."lead_channel" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "lead_channel_delivery_state_idx" ON "leads"."lead_channel" USING btree ("delivery_state");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_channel_reply_token_idx" ON "leads"."lead_channel" USING btree ("reply_token");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_contact_domain_email_idx" ON "leads"."contact" USING btree ("domain","email");--> statement-breakpoint
CREATE INDEX "lead_contact_domain_id_idx" ON "leads"."contact" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "lead_contact_email_idx" ON "leads"."contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "lead_contact_hubspot_idx" ON "leads"."contact" USING btree ("hubspot_contact_id");--> statement-breakpoint
CREATE INDEX "lead_contact_instantly_idx" ON "leads"."contact" USING btree ("instantly_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_domain_domain_idx" ON "leads"."domain" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "lead_domain_pms_idx" ON "leads"."domain" USING btree ("pms");--> statement-breakpoint
CREATE INDEX "lead_domain_tier_idx" ON "leads"."domain" USING btree ("computed_tier");--> statement-breakpoint
CREATE INDEX "lead_domain_composite_idx" ON "leads"."domain" USING btree ("score_composite");--> statement-breakpoint
CREATE INDEX "lead_domain_pregen_status_idx" ON "leads"."domain" USING btree ("pregen_status");--> statement-breakpoint
CREATE INDEX "lead_import_source_idx" ON "leads"."import" USING btree ("source");--> statement-breakpoint
CREATE INDEX "lead_import_created_idx" ON "leads"."import" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lead_outreach_domain_id_idx" ON "leads"."sequence" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "lead_outreach_status_idx" ON "leads"."sequence" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_sequence_live_enrollment_idx" ON "leads"."sequence" USING btree ("domain_id") WHERE "leads"."sequence"."status" in ('queued', 'sent');--> statement-breakpoint
CREATE UNIQUE INDEX "meta_leadgen_lead_leadgen_id_idx" ON "leads"."meta_leadgen_lead" USING btree ("leadgen_id");--> statement-breakpoint
CREATE INDEX "meta_leadgen_lead_form_idx" ON "leads"."meta_leadgen_lead" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "meta_leadgen_lead_created_idx" ON "leads"."meta_leadgen_lead" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pregen_build_prospect_id_idx" ON "leads"."pregen_build" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "pregen_build_domain_idx" ON "leads"."pregen_build" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "pregen_build_status_idx" ON "leads"."pregen_build" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pregen_build_verdict_idx" ON "leads"."pregen_build" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "sales_email_corpus_winners_idx" ON "leads"."sales_email_corpus" USING btree ("direction","got_reply","sent_at");--> statement-breakpoint
CREATE INDEX "lifecycle_campaign_brand_idx" ON "lifecycle_campaign" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "lifecycle_campaign_performance_cycle_idx" ON "lifecycle_campaign" USING btree ("performance_cycle_id");--> statement-breakpoint
CREATE INDEX "lifecycle_campaign_kind_idx" ON "lifecycle_campaign" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "lifecycle_campaign_run_state_idx" ON "lifecycle_campaign" USING btree ("run_state");--> statement-breakpoint
CREATE INDEX "lifecycle_campaign_cleanup_idx" ON "lifecycle_campaign" USING btree ("cleanup_status");--> statement-breakpoint
CREATE INDEX "lifecycle_campaign_external_idx" ON "lifecycle_campaign" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "lifecycle_program_step_program_idx" ON "lifecycle_program_step" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "lifecycle_program_brand_idx" ON "lifecycle_program" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "lifecycle_program_kind_idx" ON "lifecycle_program" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "lifecycle_program_status_idx" ON "lifecycle_program" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lifecycle_program_workspace_idx" ON "lifecycle_program" USING btree ("workspace");--> statement-breakpoint
CREATE INDEX "lifecycle_touchpoint_campaign_idx" ON "lifecycle_touchpoint" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "performance_account_org_idx" ON "performance_account" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "performance_account_status_idx" ON "performance_account" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_account_brand_live_idx" ON "performance_account" USING btree ("brand_id") WHERE "performance_account"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "performance_application_created_idx" ON "performance_application" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "performance_cycle_account_idx" ON "performance_cycle" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_cycle_account_period_idx" ON "performance_cycle" USING btree ("account_id","period");--> statement-breakpoint
CREATE INDEX "performance_cycle_status_idx" ON "performance_cycle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "performance_intake_account_idx" ON "performance_intake" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "performance_intake_status_idx" ON "performance_intake" USING btree ("status");--> statement-breakpoint
CREATE INDEX "performance_intake_brand_idx" ON "performance_intake" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "performance_property_account_idx" ON "performance_property" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_property_account_url_idx" ON "performance_property" USING btree ("account_id","wander_url");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_property_account_site_url_idx" ON "performance_property" USING btree ("account_id","site_url");--> statement-breakpoint
CREATE INDEX "performance_property_property_idx" ON "performance_property" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "performance_report_cycle_idx" ON "performance_report" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "performance_report_account_idx" ON "performance_report" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_report_token_idx" ON "performance_report" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "transactional_message_key_idx" ON "transactional_message" USING btree ("brand_id","key");--> statement-breakpoint
CREATE INDEX "transactional_message_domain_idx" ON "transactional_message" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "transactional_message_status_idx" ON "transactional_message" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactional_message_provider_idx" ON "transactional_message" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "listening_source_brand_key_uq" ON "listening_source" USING btree ("brand_id","key");--> statement-breakpoint
CREATE INDEX "listening_source_active_trigger_idx" ON "listening_source" USING btree ("is_active","trigger");--> statement-breakpoint
CREATE INDEX "listening_source_brand_idx" ON "listening_source" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_url_uq" ON "mention" USING btree ("url");--> statement-breakpoint
CREATE INDEX "mention_status_idx" ON "mention" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mention_provider_idx" ON "mention" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "mention_received_at_idx" ON "mention" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "mention_assignee_idx" ON "mention" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "home_media_home_idx" ON "home_media" USING btree ("home_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_media_asset_idx" ON "home_media" USING btree ("home_id","asset_id") WHERE "home_media"."asset_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "home_media_source_idx" ON "home_media" USING btree ("home_id","source_url") WHERE "home_media"."source_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "home_brand_idx" ON "home" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_brand_external_idx" ON "home" USING btree ("brand_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_brand_url_idx" ON "home" USING btree ("brand_id","url_key");--> statement-breakpoint
CREATE INDEX "media_asset_brand_idx" ON "media_asset" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "media_asset_folder_idx" ON "media_asset" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "media_asset_kind_idx" ON "media_asset" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "media_asset_status_idx" ON "media_asset" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_discovered_source_idx" ON "media_asset" USING btree ("brand_id","discovered_source_url");--> statement-breakpoint
CREATE INDEX "media_asset_uploaded_by_idx" ON "media_asset" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "media_asset_r2_key_idx" ON "media_asset" USING btree ("r2_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_stream_uid_idx" ON "media_asset" USING btree ("stream_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_source_post_item_idx" ON "media_asset" USING btree ("brand_id","source_platform_post_id","source_media_index");--> statement-breakpoint
CREATE INDEX "media_asset_tag_asset_idx" ON "media_asset_tag" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "media_asset_tag_tag_idx" ON "media_asset_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "media_folder_brand_idx" ON "media_folder" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_folder_brand_name_idx" ON "media_folder" USING btree ("brand_id","name");--> statement-breakpoint
CREATE INDEX "media_tag_brand_idx" ON "media_tag" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_tag_brand_name_idx" ON "media_tag" USING btree ("brand_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "media_video_analysis_post_item_idx" ON "media_video_analysis" USING btree ("organization_id","platform_post_id","source_media_index");--> statement-breakpoint
CREATE INDEX "media_video_analysis_org_idx" ON "media_video_analysis" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "media_video_analysis_post_idx" ON "media_video_analysis" USING btree ("platform_post_id");--> statement-breakpoint
CREATE INDEX "media_video_analysis_status_idx" ON "media_video_analysis" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pregen_native_artifact_build_idx" ON "pregen_native_artifact" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "pregen_native_artifact_prospect_idx" ON "pregen_native_artifact" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "pregen_native_build_prospect_idx" ON "pregen_native_build" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "pregen_native_crawl_page_build_idx" ON "pregen_native_crawl_page" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "pregen_native_evaluation_receipt_build_created_idx" ON "pregen_native_evaluation_receipt" USING btree ("build_id","created_at");--> statement-breakpoint
CREATE INDEX "pregen_native_evaluation_receipt_build_kind_created_idx" ON "pregen_native_evaluation_receipt" USING btree ("build_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pregen_native_prospect_domain_idx" ON "pregen_native_prospect" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "pregen_native_prospect_token_idx" ON "pregen_native_prospect" USING btree ("preview_token");--> statement-breakpoint
CREATE UNIQUE INDEX "web_page_brand_path_idx" ON "web_page" USING btree ("brand_id","path");--> statement-breakpoint
CREATE INDEX "web_page_brand_idx" ON "web_page" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "web_page_type_idx" ON "web_page" USING btree ("page_type");--> statement-breakpoint
CREATE INDEX "web_page_location_idx" ON "web_page" USING btree ("location_slug");--> statement-breakpoint
CREATE INDEX "booking_target_brand_idx" ON "booking_target" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "home_group_member_home_idx" ON "home_group_member" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "home_group_brand_idx" ON "home_group" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_group_featured_unique" ON "home_group" USING btree ("brand_id") WHERE "home_group"."kind" = 'featured';--> statement-breakpoint
CREATE UNIQUE INDEX "client_page_view_session_idx" ON "client_page_view" USING btree ("brand_id","surface","visit_id");--> statement-breakpoint
CREATE INDEX "client_page_view_brand_idx" ON "client_page_view" USING btree ("brand_id","viewed_at");--> statement-breakpoint
CREATE INDEX "email_audience_snapshot_audience_idx" ON "email_audience_snapshot" USING btree ("audience_id","created_at");--> statement-breakpoint
CREATE INDEX "email_audience_brand_idx" ON "email_audience" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_member_post_unique" ON "initiative_member" USING btree ("initiative_id","content_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_member_series_unique" ON "initiative_member" USING btree ("initiative_id","series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_member_campaign_unique" ON "initiative_member" USING btree ("initiative_id","campaign_id");--> statement-breakpoint
CREATE INDEX "initiative_member_post_idx" ON "initiative_member" USING btree ("content_post_id");--> statement-breakpoint
CREATE INDEX "initiative_member_series_idx" ON "initiative_member" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "initiative_member_campaign_idx" ON "initiative_member" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "initiative_org_idx" ON "initiative" USING btree ("organization_id");
--> statement-breakpoint
-- Preserve the existing home-group synchronization and brand-scope guards.
CREATE OR REPLACE FUNCTION public.growth_booking_target_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NEW.home_id IS NOT NULL AND NEW.home_group_id IS NOT NULL THEN RAISE EXCEPTION 'Choose one home or group'; END IF;
 IF NEW.home_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.home WHERE id = NEW.home_id AND brand_id = NEW.brand_id) THEN RAISE EXCEPTION 'Home belongs to another brand'; END IF;
 IF NEW.home_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.home_group WHERE id = NEW.home_group_id AND brand_id = NEW.brand_id) THEN RAISE EXCEPTION 'Group belongs to another brand'; END IF;
 IF (NEW.check_in IS NULL) <> (NEW.check_out IS NULL) OR (NEW.check_in IS NOT NULL AND NEW.check_out <= NEW.check_in) THEN RAISE EXCEPTION 'Invalid stay dates'; END IF;
 IF NEW.guests IS NOT NULL AND NEW.guests < 1 THEN RAISE EXCEPTION 'Invalid guest count'; END IF;
 RETURN NEW;
END $function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.growth_default_home_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 INSERT INTO public.home_group(id, brand_id, name, kind) VALUES ('hgroup_featured_' || NEW.id, NEW.id, 'Featured homes', 'featured') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.growth_featured_flag_to_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE gid text;
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 SELECT id INTO gid FROM public.home_group WHERE brand_id = NEW.brand_id AND kind = 'featured';
 IF NEW.featured AND NEW.deleted_at IS NULL THEN
  INSERT INTO public.home_group_member(group_id, home_id, sort_order) VALUES (gid, NEW.id, coalesce(NEW.sort_order, 0)) ON CONFLICT(group_id, home_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
 ELSE DELETE FROM public.home_group_member WHERE group_id = gid AND home_id = NEW.id; END IF;
 RETURN NEW;
END $function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.growth_featured_group_to_flag()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END $function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.growth_home_group_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.home_group g JOIN public.home h ON h.brand_id = g.brand_id WHERE g.id = NEW.group_id AND h.id = NEW.home_id AND h.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'Home and group must belong to the same brand'; END IF;
 RETURN NEW;
END $function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.show_db_tree()
 RETURNS TABLE(tree_structure text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- First show all databases
    RETURN QUERY
    SELECT ':file_folder: ' || datname || ' (DATABASE)'
    FROM pg_database 
    WHERE datistemplate = false;

    -- Then show current database structure
    RETURN QUERY
    WITH RECURSIVE 
    -- Get schemas
    schemas AS (
        SELECT 
            n.nspname AS object_name,
            1 AS level,
            n.nspname AS path,
            'SCHEMA' AS object_type
        FROM pg_namespace n
        WHERE n.nspname NOT LIKE 'pg_%' 
        AND n.nspname != 'information_schema'
    ),

    -- Get all objects (tables, views, functions, etc.)
    objects AS (
        SELECT 
            c.relname AS object_name,
            2 AS level,
            s.path || ' → ' || c.relname AS path,
            CASE c.relkind
                WHEN 'r' THEN 'TABLE'
                WHEN 'v' THEN 'VIEW'
                WHEN 'm' THEN 'MATERIALIZED VIEW'
                WHEN 'i' THEN 'INDEX'
                WHEN 'S' THEN 'SEQUENCE'
                WHEN 'f' THEN 'FOREIGN TABLE'
            END AS object_type
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN schemas s ON n.nspname = s.object_name
        WHERE c.relkind IN ('r','v','m','i','S','f')

        UNION ALL

        SELECT 
            p.proname AS object_name,
            2 AS level,
            s.path || ' → ' || p.proname AS path,
            'FUNCTION' AS object_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN schemas s ON n.nspname = s.object_name
    ),

    -- Combine schemas and objects
    combined AS (
        SELECT * FROM schemas
        UNION ALL
        SELECT * FROM objects
    )

    -- Final output with tree-like formatting
    SELECT 
        REPEAT('    ', level) || 
        CASE 
            WHEN level = 1 THEN '└── :open_file_folder: '
            ELSE '    └── ' || 
                CASE object_type
                    WHEN 'TABLE' THEN ':bar_chart: '
                    WHEN 'VIEW' THEN ':eye: '
                    WHEN 'MATERIALIZED VIEW' THEN ':newspaper: '
                    WHEN 'FUNCTION' THEN ':zap: '
                    WHEN 'INDEX' THEN ':mag: '
                    WHEN 'SEQUENCE' THEN ':1234: '
                    WHEN 'FOREIGN TABLE' THEN ':globe_with_meridians: '
                    ELSE ''
                END
        END || object_name || ' (' || object_type || ')'
    FROM combined
    ORDER BY path;
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER growth_booking_target_scope BEFORE INSERT OR UPDATE ON public.booking_target FOR EACH ROW EXECUTE FUNCTION growth_booking_target_scope();
--> statement-breakpoint
CREATE TRIGGER growth_default_home_group AFTER INSERT ON public.brand FOR EACH ROW EXECUTE FUNCTION growth_default_home_group();
--> statement-breakpoint
CREATE TRIGGER growth_featured_flag_to_group AFTER INSERT OR UPDATE OF featured, sort_order, deleted_at ON public.home FOR EACH ROW EXECUTE FUNCTION growth_featured_flag_to_group();
--> statement-breakpoint
CREATE TRIGGER growth_featured_group_to_flag AFTER INSERT OR DELETE OR UPDATE OF sort_order ON public.home_group_member FOR EACH ROW EXECUTE FUNCTION growth_featured_group_to_flag();
--> statement-breakpoint
CREATE TRIGGER growth_home_group_scope BEFORE INSERT OR UPDATE ON public.home_group_member FOR EACH ROW EXECUTE FUNCTION growth_home_group_scope();
