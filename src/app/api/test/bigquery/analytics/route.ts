import { NextResponse } from "next/server";
import { executeQuery } from "@/server/clients/bigquery.client";

/**
 * Test confirmed access to analytics tables
 *
 * GET /api/test/bigquery/analytics
 *
 * Runs a lightweight sample query against each analytics table
 * the sync pipeline depends on, returning a row of real data
 * so you can visually confirm the schema matches expectations.
 */
export async function GET() {
  const startMs = Date.now();
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  const checks = [
    {
      name: "customer_profiles",
      query: `
        SELECT id_user, email, phone, first_name, last_name, city, state, country,
               count_confirmed_bookings, total_booking_revenue, ts_created
        FROM \`wander-9fc9c.analytics.customer_profiles\`
        WHERE email IS NOT NULL AND count_confirmed_bookings > 0
        ORDER BY ts_created DESC
        LIMIT 3
      `,
    },
    {
      name: "funnel_events",
      query: `
        SELECT id_user, event_type, property_name, ts
        FROM \`wander-9fc9c.analytics.funnel_events\`
        WHERE event_type IN ('checkout_started', 'payment_info_entered', 'order_completed')
        ORDER BY ts DESC
        LIMIT 5
      `,
    },
    {
      name: "bookings",
      query: `
        SELECT id_user, id_booking, property_name, status, booking_type,
               ts_confirmed, check_in_date, check_out_date
        FROM \`wander-9fc9c.analytics.bookings\`
        WHERE status = 'confirmed'
        ORDER BY ts_confirmed DESC
        LIMIT 3
      `,
    },
    {
      name: "properties",
      query: `
        SELECT id_unit, property_name, city, state, bedrooms, base_price,
               is_bookable, is_listed
        FROM \`wander-9fc9c.analytics.properties\`
        WHERE is_bookable = TRUE
        ORDER BY property_name
        LIMIT 3
      `,
    },
    {
      name: "reviews",
      query: `
        SELECT id_unit, id_reviewer, score, status, ts_created
        FROM \`wander-9fc9c.analytics.int_reviews\`
        ORDER BY ts_created DESC
        LIMIT 3
      `,
    },
  ];

  const checkResults = await Promise.allSettled(
    checks.map(async (check) => {
      const rows = await executeQuery<Record<string, unknown>>(check.query);
      return { name: check.name, rows };
    }),
  );

  for (const [i, result] of checkResults.entries()) {
    const name = checks[i]!.name;
    if (result.status === "fulfilled") {
      results[name] = {
        ok: true,
        rowCount: result.value.rows.length,
        sample: result.value.rows,
      };
    } else {
      errors[name] =
        result.reason instanceof Error
          ? result.reason.message
          : "Unknown error";
    }
  }

  return NextResponse.json({
    success: Object.keys(errors).length === 0,
    durationMs: Date.now() - startMs,
    tablesChecked: checks.length,
    tablesOk: checks.length - Object.keys(errors).length,
    results,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  });
}
