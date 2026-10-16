import { usStateCode, usStateName } from "@/lib/us-states";
import type { SeedDefinition, SeedQueryParams } from "@/lib/seed-definition";

const A = "wander-9fc9c.analytics";
const W = "wander-9fc9c.wos_datastream";
export const seedEligibleProfilesSql = `profiles AS (
 SELECT id_user,LOWER(TRIM(email)) email,UPPER(TRIM(country)) country,
 COALESCE(is_deleted,FALSE) deleted,COALESCE(is_banned,FALSE) banned
 FROM \`${A}.customer_profiles\`
 QUALIFY ROW_NUMBER() OVER(PARTITION BY id_user ORDER BY ts_updated DESC,ts_created DESC,email)=1
), eligible AS (
 SELECT id_user,email,country,LOWER(TO_HEX(SHA256(email))) email_hash FROM profiles
 WHERE NOT deleted AND NOT banned AND NOT ENDS_WITH(email,'@wander.com')
 AND REGEXP_CONTAINS(email,r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$')
)`;

export function buildWanderSeedQuery(d: SeedDefinition, asOf: string) {
  const params: SeedQueryParams = {
    asOf,
    bookingDays: d.bookingDays,
    intentDays: d.intentDays,
    countries: d.countries,
  };
  const matches = d.searches.map((s, i) => {
    const f = s.filter,
      key = `s${i}`,
      conditions: string[] = [];
    params[`${key}_key`] = s.key;
    for (const field of ["states", "cities", "landscapes"] as const) {
      if (!f[field].length) continue;
      const column = {
        states: "state",
        cities: "city",
        landscapes: "landscape_category",
      }[field];
      params[`${key}_${field}`] = f[field].map((v) =>
        (field === "states" ? usStateName(usStateCode(v)) || v : v)
          .trim()
          .toLowerCase(),
      );
      conditions.push(`LOWER(TRIM(p.${column})) IN UNNEST(@${key}_${field})`);
    }
    if (f.terms.length) {
      params[`${key}_terms`] = f.terms.map((v) => v.toLowerCase());
      conditions.push(
        `EXISTS(SELECT 1 FROM UNNEST(@${key}_terms) term WHERE STRPOS(LOWER(CONCAT(COALESCE(p.property_name,''),' ',COALESCE(p.description,''),' ',COALESCE(TO_JSON_STRING(p.activities),''))),term)>0)`,
      );
    }
    for (const field of ["minBedrooms", "minOccupancy"] as const) {
      if (f[field] === null) continue;
      params[`${key}_${field}`] = f[field];
      conditions.push(
        `p.${field === "minBedrooms" ? "bedrooms" : "occupancy"} >= @${key}_${field}`,
      );
    }
    if (f.petsAllowed !== null) {
      params[`${key}_pets`] = f.petsAllowed;
      conditions.push(`p.is_pet_allowed=@${key}_pets`);
    }
    let ring = "0";
    if (f.near) {
      params[`${key}_lat`] = f.near.latitude;
      params[`${key}_lon`] = f.near.longitude;
      params[`${key}_radii`] = f.near.radiiKm;
      const distance = `ST_DISTANCE(SAFE.ST_GEOGPOINT(SAFE_CAST(p.longitude AS FLOAT64),SAFE_CAST(p.latitude AS FLOAT64)),ST_GEOGPOINT(@${key}_lon,@${key}_lat))/1000`;
      ring = `(SELECT MIN(off) FROM UNNEST(@${key}_radii) radius WITH OFFSET off WHERE ${distance}<=radius)`;
      conditions.push(
        `${distance}<= (SELECT MAX(radius) FROM UNNEST(@${key}_radii) radius)`,
      );
    }
    return `SELECT p.id_unit,@${key}_key search,${ring} ring FROM properties p WHERE ${conditions.join(" AND ") || "TRUE"}`;
  });
  if (!matches.length)
    throw new Error("Choose property searches before querying Wander");
  return {
    params,
    sql: `WITH ${seedEligibleProfilesSql}, properties AS (
 SELECT * FROM \`${A}.properties\` WHERE id_unit IS NOT NULL
 QUALIFY ROW_NUMBER() OVER(PARTITION BY id_unit ORDER BY ts_updated DESC)=1
), aliases AS (
 SELECT alias,p.id_unit FROM properties p,UNNEST([p.id_unit,p.id_unit_new]) alias WHERE alias IS NOT NULL
 GROUP BY alias,p.id_unit
 QUALIFY COUNT(*) OVER(PARTITION BY alias)=1
), matches AS (${matches.join(" UNION ALL ")}), bookings AS (
 SELECT * FROM \`${A}.bookings\` WHERE ts_created<TIMESTAMP(@asOf)
 QUALIFY ROW_NUMBER() OVER(PARTITION BY id_booking ORDER BY ts_created DESC)=1
), signals AS (
 SELECT p.email_hash,m.search,m.ring,'wander_bookers' source,
 COUNT(DISTINCT b.id_booking) bookings,0 views,0 dates,0 checkouts
 FROM bookings b JOIN eligible p USING(id_user) JOIN aliases a ON a.alias=b.id_unit JOIN matches m ON m.id_unit=a.id_unit
 WHERE ${d.wanderSignals.includes("bookers") ? "TRUE" : "FALSE"} AND b.status='confirmed' AND b.ts_canceled IS NULL
 AND b.ts_confirmed>=TIMESTAMP_SUB(TIMESTAMP(@asOf),INTERVAL @bookingDays DAY) AND b.ts_confirmed<TIMESTAMP(@asOf)
 AND NOT COALESCE(b.is_wander_saas,FALSE) AND COALESCE(b.is_direct_booking,FALSE) AND NOT COALESCE(b.is_manual_booking,FALSE)
 AND p.country IN UNNEST(@countries) GROUP BY 1,2,3
 UNION ALL
 SELECT p.email_hash,m.search,m.ring,'wander_intent' source,0 bookings,
 COUNT(DISTINCT IF(f.event_type='property_page_view',f.id_event,NULL)) views,
 COUNT(DISTINCT IF(f.event_type IN ('property_dates_selected','property_dates_updated'),f.id_event,NULL)) dates,
 COUNT(DISTINCT IF(f.event_type IN ('checkout_previewed','checkout_started','payment_info_entered'),f.id_event,NULL)) checkouts
 FROM \`${A}.funnel_events\` f JOIN eligible p USING(id_user) JOIN aliases a ON a.alias=f.id_unit JOIN matches m ON m.id_unit=a.id_unit
 WHERE ${d.wanderSignals.includes("intent") ? "TRUE" : "FALSE"} AND f.ts>=TIMESTAMP_SUB(TIMESTAMP(@asOf),INTERVAL @intentDays DAY) AND f.ts<TIMESTAMP(@asOf)
 AND p.country IN UNNEST(@countries) AND NOT COALESCE(f.is_wander_user,FALSE)
 AND NOT COALESCE(f.is_bot_event,FALSE) AND NOT COALESCE(f.is_ai_bot_event,FALSE) AND NOT COALESCE(f.is_automation_event,FALSE)
 AND f.event_source IN ('website','app')
 AND f.event_type IN ('property_page_view','property_dates_selected','property_dates_updated','checkout_previewed','checkout_started','payment_info_entered')
 GROUP BY 1,2,3
) SELECT * FROM signals`,
  };
}

export const seedClientUsersSql = `users AS (
 SELECT id,LOWER(TRIM(email)) email,COALESCE(deleted,FALSE) deleted,deletedAt
 FROM \`${W}.public_User\` QUALIFY ROW_NUMBER() OVER(PARTITION BY id ORDER BY updatedAt DESC)=1
)`;
export function buildClientSeedQuery(websiteId: string, asOf: string) {
  return {
    params: { websiteId, asOf },
    sql: `WITH website AS (
 SELECT id,organizationId FROM \`${W}.public_SaasWebsite\` WHERE id=@websiteId
 QUALIFY ROW_NUMBER() OVER(PARTITION BY id ORDER BY updatedAt DESC)=1
), ${seedClientUsersSql}, bookings AS (
 SELECT b.* FROM \`${W}.public_v2Booking\` b JOIN website w ON b.websiteId=w.id AND b.organizationId=w.organizationId
 QUALIFY ROW_NUMBER() OVER(PARTITION BY b.id ORDER BY b.updatedAt DESC)=1
) SELECT LOWER(TO_HEX(SHA256(u.email))) email_hash,COUNT(DISTINCT b.id) bookings
 FROM bookings b JOIN users u ON u.id=b.primaryGuestId
 WHERE b.channel='GENERATED_WEBSITE' AND b.confirmedAt IS NOT NULL AND b.cancelledAt IS NULL AND b.confirmedAt<TIMESTAMP(@asOf)
 AND NOT u.deleted AND u.deletedAt IS NULL AND REGEXP_CONTAINS(u.email,r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$') GROUP BY 1`,
  };
}
