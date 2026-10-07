ALTER TABLE "performance_cycle" ALTER COLUMN "billed_amount" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "performance_cycle" ALTER COLUMN "media_budget" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "performance_account" ADD COLUMN "monthly_fee" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "performance_account" ADD COLUMN "agreed_ad_spend" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "performance_account" ADD COLUMN "client_media_contribution" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "performance_account" ADD COLUMN "effective_date" date;--> statement-breakpoint
ALTER TABLE "performance_account" ADD COLUMN "terms" text;--> statement-breakpoint
ALTER TABLE "performance_account" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "performance_cycle" ADD COLUMN "client_media_contribution" numeric(14, 2);--> statement-breakpoint
-- Preserve existing media billing when introducing the separate charge.
UPDATE performance_cycle SET client_media_contribution = media_budget;
--> statement-breakpoint
-- Promote already recorded tracker terms onto the commercial account.
UPDATE performance_account AS a SET
  monthly_fee = COALESCE(CASE WHEN jsonb_typeof(b.performance_settings->'monthlyFee') = 'number' THEN (b.performance_settings->>'monthlyFee')::numeric END, c.billed_amount),
  agreed_ad_spend = COALESCE(CASE WHEN jsonb_typeof(b.performance_settings->'agreedAdSpend') = 'number' THEN (b.performance_settings->>'agreedAdSpend')::numeric END, c.media_budget),
  client_media_contribution = COALESCE(CASE WHEN jsonb_typeof(b.performance_settings->'agreedAdSpend') = 'number' THEN (b.performance_settings->>'agreedAdSpend')::numeric END, c.media_budget),
  effective_date = COALESCE(NULLIF(b.performance_settings->>'effectiveDate', '')::date, a.signed_at::date),
  terms = NULLIF(b.performance_settings->>'terms', ''),
  end_date = NULLIF(b.performance_settings->>'endDate', '')::date
FROM brand AS b
LEFT JOIN LATERAL (
  SELECT pc.billed_amount, pc.media_budget FROM performance_cycle pc
  JOIN performance_account pa ON pa.id = pc.account_id
  WHERE pa.brand_id = b.id AND pc.period <= to_char(current_date, 'YYYY-MM')
  ORDER BY pc.period DESC LIMIT 1
) AS c ON true
WHERE a.brand_id = b.id AND a.organization_id = b.organization_id;
