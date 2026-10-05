// Recreate a brand's weekly promo emails from the Performance promo program
// (promo-program/clients/<slug>/emails/NN-<slug>.json) as newsletter blasts in
// Growth's own layout: the promo's copy and offer, its featured homes as cards
// from the brand's own homes, placed where the copy listed them. Sets the
// brand's email sender from its perf-email brand config (needs
// the committed Drizzle migrations). An issue already on the calendar gets a new
// revision, so the earlier one stays restorable. Drafts only; nothing is sent.
//
//   bun --conditions=react-server run scripts/import-performance-promos.ts \
//     --emails <dir> --brand-config <brands/wpe.json> --brand winter-park-escapes \
//     [--send-time 10:00] [--execute]
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  contentPostTable,
  platformPostTable,
  userTable,
} from "@/server/db/schema";
import {
  DIGEST_TEMPLATE_KEY,
  HOMES_MARKER,
  type ListingsDigest,
} from "@/lib/listings-digest";
import {
  createEmailSlot,
  saveEmailDocument,
} from "@/server/services/email-document.service";
import {
  digestSectionFromBrandHomes,
  listBrandEmailHomes,
} from "@/server/services/newsletter-homes.service";

type PromoEmail = {
  week: number;
  send_date: string;
  concept: string;
  subject: string;
  offer: string;
  code: string;
  featured_homes: string[];
  body_html: string;
};

type PromoHeader = {
  photo: string;
  eyebrow: string;
  headline: string;
  detail: string;
};

type BrandConfig = {
  timezone: string;
  op: {
    op_site_url: string;
    op_from_name: string;
    op_from_email: string;
    op_reply_to: string;
  };
};

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const emailsDir = arg("emails");
const brandConfigPath = arg("brand-config");
const brandSlug = arg("brand");
const sendTime = arg("send-time") ?? "10:00";
const execute = process.argv.includes("--execute");
if (!emailsDir || !brandConfigPath || !brandSlug) {
  throw new Error("--emails, --brand-config and --brand are required.");
}

/** Wall-clock time in a zone → UTC instant, for the calendar date. */
function zonedInstant(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const asZoned = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`,
  );
  return new Date(guess.getTime() - (asZoned.getTime() - guess.getTime()));
}

/**
 * The promo body arrives as email HTML: a relative header image, its featured
 * homes as a bulleted list, and its CTA as a `data-email-button` paragraph.
 * The header becomes its hosted photo, the list becomes the spot the home
 * cards go (the end of the copy when it has none), and the button moves to
 * the document's CTA fields.
 */
function toDraft(
  email: PromoEmail,
  header: PromoHeader | null,
  digest: ListingsDigest | null,
) {
  let body = email.body_html;
  body = body.replace(
    /<p><img src="\.\.\/[^"]*"([^>]*)><\/p>/,
    header ? `<p><img src="${header.photo}"$1></p>` : "",
  );
  let ctaLabel: string | null = null;
  let ctaUrl: string | null = null;
  body = body.replace(
    /<p><a data-email-button href="([^"]+)">([^<]+)<\/a><\/p>/,
    (_match, href: string, label: string) => {
      ctaUrl = href.replace(/&amp;/g, "&");
      ctaLabel = label;
      return "";
    },
  );
  if (digest) {
    body = /<ul>[\s\S]*?<\/ul>/.test(body)
      ? body.replace(/<ul>[\s\S]*?<\/ul>/, HOMES_MARKER)
      : `${body}${HOMES_MARKER}`;
  }
  return {
    subject: email.subject,
    preheader: header ? `${header.headline} · ${header.detail}` : null,
    bodyMarkdown: body,
    ctaLabel,
    ctaUrl,
    templateKey: digest ? DIGEST_TEMPLATE_KEY : "editorial",
    digest,
  };
}

const config = JSON.parse(
  await readFile(brandConfigPath, "utf8"),
) as BrandConfig;
const brand = await db.query.brandTable.findFirst({
  where: and(eq(brandTable.slug, brandSlug), isNull(brandTable.deletedAt)),
});
if (!brand?.organizationId) throw new Error(`No brand ${brandSlug}.`);
const operator = await db.query.userTable.findFirst({
  where: eq(userTable.email, "kristian@wander.com"),
});
if (!operator) throw new Error("No importing user.");

const sender = {
  fromName: config.op.op_from_name,
  fromEmail: config.op.op_from_email,
  replyTo: config.op.op_reply_to || null,
  siteUrl: config.op.op_site_url || null,
};
console.log(`${brand.name}: sender`, sender);
if (execute) {
  await db
    .update(brandTable)
    .set({
      emailSender: sql`coalesce(${brandTable.emailSender}, '{}'::jsonb) || ${JSON.stringify(sender)}::jsonb`,
    })
    .where(eq(brandTable.id, brand.id));
}

const brandHomes = await listBrandEmailHomes({
  brandId: brand.id,
  orgId: brand.organizationId,
});
const homeIdByName = new Map(
  brandHomes.map((home) => [home.name.trim().toLowerCase(), home.id]),
);

const files = (await readdir(emailsDir))
  .filter((name) => /^\d+-[a-z]+\.json$/.test(name))
  .sort();
for (const file of files) {
  const email = JSON.parse(
    await readFile(path.join(emailsDir, file), "utf8"),
  ) as PromoEmail;
  const headerPath = path.join(
    emailsDir,
    file.replace(".json", ".header.json"),
  );
  const header = await readFile(headerPath, "utf8")
    .then((text) => JSON.parse(text) as PromoHeader)
    .catch(() => null);
  const plannedAt = zonedInstant(email.send_date, sendTime, config.timezone);
  const homeIds = email.featured_homes.flatMap((name) => {
    const id = homeIdByName.get(name.trim().toLowerCase());
    if (!id) console.log(`  ⚠ ${file}: no brand home named "${name}"`);
    return id ? [id] : [];
  });
  const digest: ListingsDigest | null = homeIds.length
    ? {
        schema: "wander-growth.listings-digest.v1",
        theme: null,
        rationale: email.concept,
        sections: [
          await digestSectionFromBrandHomes({
            brandId: brand.id,
            orgId: brand.organizationId,
            homeIds,
            heading: header?.headline ?? "Featured homes",
            campaign: email.subject,
          }),
        ],
      }
    : null;
  const draft = toDraft(email, header, digest);

  const existing = await db.query.contentPostTable.findFirst({
    where: and(
      eq(contentPostTable.brandId, brand.id),
      eq(contentPostTable.title, email.subject),
      isNull(contentPostTable.deletedAt),
    ),
  });
  const label = `week ${email.week} ${plannedAt.toISOString()} "${email.subject}" (${homeIds.length} home cards)`;
  if (!draft.ctaUrl) console.log(`  ⚠ ${file}: no CTA button found`);
  const spot = existing
    ? await db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.contentPostId, existing.id),
      })
    : null;
  if (!execute) {
    console.log(`${spot ? "would recreate" : "would create"} ${label}`);
    continue;
  }
  if (spot) {
    await saveEmailDocument({
      platformPostId: spot.id,
      organizationId: brand.organizationId,
      userId: operator.id,
      draft,
      note: `Recreated in Growth's layout from the promo program (${file})`,
    });
    console.log(`recreated ${label} → /app/newsletters/${spot.id}`);
    continue;
  }

  const slot = await createEmailSlot({
    organizationId: brand.organizationId,
    userId: operator.id,
    brandId: brand.id,
    title: email.subject,
    format: "newsletter.blast",
    hook: email.concept,
    purpose: `${email.offer} (code ${email.code})`,
    plannedAt: plannedAt.toISOString(),
  });
  await saveEmailDocument({
    platformPostId: slot.platformPostId,
    organizationId: brand.organizationId,
    userId: operator.id,
    draft,
    note: `Imported from the promo program (${file})`,
  });
  console.log(`created ${label} → ${slot.url}`);
}
if (!execute) console.log("\nDry run. Pass --execute to write.");
