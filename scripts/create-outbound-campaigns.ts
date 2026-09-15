/**
 * Create the A/B/C cold-outbound campaigns in Instantly FROM the lifecycle
 * programs (the in-repo intent), and push Kristian's test aliases as leads.
 *
 * Safe by design: campaigns are created as DRAFT and NOT launched — no email
 * sends until someone clicks Launch in Instantly (after eyeballing the rendered
 * copy, especially the HTML/image variant). Idempotent-ish: skips a program
 * that already has `metadata.instantlyTestCampaignId` (pass --force to recreate).
 *
 * Run: bun --conditions react-server scripts/create-outbound-campaigns.ts [--force]
 */
import { and, eq, isNull } from "drizzle-orm";

import {
  addLeadsBulk,
  createCampaign,
  deleteCampaign,
} from "@/server/clients/instantly.client";
import type { CreateCampaignRequest } from "@/server/clients/instantly.types";
import { db } from "@/server/db";
import {
  leadContactTable,
  lifecycleProgramStepTable,
  lifecycleProgramTable,
} from "@/server/db/schema";

const BRAND_ID = "brand_BvLx3xvsfaMvvr4k"; // WanderOS
const TEST_DOMAIN = "outbound-test.wander";
const TEST_COMPANY = "Outbound Test (Kristian)";
// NOTE: only Emily-persona burner mailboxes are connected to Instantly (see
// `instantly-accounts.ts`). For a self-test of copy/format/deliverability this is
// fine; the real-identity send (a connected Kristian/James mailbox) is separate.
const SENDING_ACCOUNT = "emily@listonwander.com";
const FORCE = process.argv.includes("--force");

// Per-variant send mode.
//   A — plaintext, no link (text_only): the deliverability floor / reply-only.
//   B — HTML, link, no image.   C — HTML, link + image.
// (Plaintext bodies that contain a raw https URL get stripped by Instantly, so B
// uses HTML like C. Bonus: B-vs-C now isolates exactly the image effect.)
const VARIANT_TEXT_ONLY: Record<string, boolean> = {
  A: true,
  B: false,
  C: false,
};

/**
 * Render our stored markdown-ish body to Instantly-compatible HTML. Instantly's
 * editor format is one <div> per line (bare text nodes get stripped by its
 * sanitizer), so wrap each line in <div> and blank lines in <div><br></div>.
 */
function toHtml(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return "<div><br></div>";
      let l = line;
      // markdown image → <img>
      l = l.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        (_m, alt: string, url: string) =>
          `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;" />`,
      );
      // /os link → friendly anchor (keeps the long UTM URL out of the visible text)
      l = l.replace(
        /https:\/\/www\.wander\.com\/os\?\S+/g,
        (url) => `<a href="${url}">wander.com/os →</a>`,
      );
      return `<div>${l}</div>`;
    })
    .join("");
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const schedule = {
  start_date: fmt(today),
  end_date: fmt(new Date(today.getTime() + 30 * 86_400_000)),
  schedules: [
    {
      // Always-on so the test fires immediately on launch (mirrors the existing
      // e2e test campaign). timezone "America/Detroit" = Instantly's Eastern
      // value (it rejects "America/New_York").
      name: "Always on (test)",
      timing: { from: "00:00", to: "23:59" },
      days: {
        "0": true,
        "1": true,
        "2": true,
        "3": true,
        "4": true,
        "5": true,
        "6": true,
      },
      timezone: "America/Detroit",
    },
  ],
};

const programs = await db
  .select()
  .from(lifecycleProgramTable)
  .where(
    and(
      eq(lifecycleProgramTable.brandId, BRAND_ID),
      eq(lifecycleProgramTable.kind, "outbound"),
      isNull(lifecycleProgramTable.deletedAt),
    ),
  );

for (const program of programs) {
  const meta = (program.metadata as Record<string, unknown> | null) ?? {};
  const variant = meta.variant as string | undefined;
  const existingCampaignId =
    typeof meta.instantlyTestCampaignId === "string"
      ? meta.instantlyTestCampaignId
      : typeof meta.instantlyTestCampaignId === "number"
        ? String(meta.instantlyTestCampaignId)
        : null;
  if (!variant || !(variant in VARIANT_TEXT_ONLY)) {
    console.log(`skip "${program.name}" (no A/B/C variant in metadata)`);
    continue;
  }
  if (existingCampaignId && !FORCE) {
    console.log(
      `skip ${variant}: already has campaign ${existingCampaignId} (use --force to recreate)`,
    );
    continue;
  }
  if (existingCampaignId && FORCE) {
    try {
      await deleteCampaign(existingCampaignId);
      console.log(`  deleted old campaign ${existingCampaignId}`);
    } catch (e) {
      console.warn(
        `  could not delete old campaign ${existingCampaignId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  const textOnly = VARIANT_TEXT_ONLY[variant]!;

  const steps = await db
    .select()
    .from(lifecycleProgramStepTable)
    .where(eq(lifecycleProgramStepTable.programId, program.id))
    .orderBy(lifecycleProgramStepTable.position);

  const seqSteps = steps.map((s, i) => {
    const next = steps[i + 1];
    const gapDays =
      next?.delayMinutes != null && s.delayMinutes != null
        ? Math.round((next.delayMinutes - s.delayMinutes) / 1440)
        : 0;
    const body = textOnly ? (s.body ?? "") : toHtml(s.body ?? "");
    return {
      type: "email" as const,
      delay: gapDays, // days to wait AFTER this step (Day 0 → 2 → 5 ⇒ [2, 3, 0])
      delay_unit: "days" as const,
      variants: [{ subject: s.subject ?? "", body }],
    };
  });

  const req: CreateCampaignRequest = {
    name: `${program.name} [TEST]`,
    campaign_schedule: schedule,
    sequences: [{ steps: seqSteps }],
    email_list: [SENDING_ACCOUNT],
    daily_limit: 50,
    link_tracking: false, // keep clean UTMs + deliverability; landings measured downstream (Amplitude/HubSpot)
    open_tracking: false,
    stop_on_reply: true,
    stop_on_auto_reply: true,
    text_only: textOnly,
  };

  const campaign = await createCampaign(req);
  console.log(
    `created ${variant}: ${campaign.id} (status ${campaign.status}, text_only=${textOnly}) "${campaign.name}"`,
  );

  // push the matching test alias as a lead
  const email = `kristian.e.boe+seq${variant.toLowerCase()}@gmail.com`;
  const [contact] = await db
    .select()
    .from(leadContactTable)
    .where(
      and(
        eq(leadContactTable.domain, TEST_DOMAIN),
        eq(leadContactTable.email, email),
      ),
    );
  if (!contact) {
    console.warn(`  ⚠️  no staged test contact ${email}`);
  } else {
    const res = await addLeadsBulk({
      campaign_id: campaign.id,
      leads: [
        {
          email: contact.email,
          first_name: contact.firstName ?? "Kristian",
          company_name: TEST_COMPANY,
        },
      ],
    });
    const leadId = res.created_leads?.[0]?.id ?? null;
    console.log(
      `  pushed ${email} → lead ${leadId ?? "(check response)"} (uploaded ${res.leads_uploaded})`,
    );
    await db
      .update(leadContactTable)
      .set({
        instantlyCampaignId: campaign.id,
        instantlyLeadId: leadId,
        pushedToInstantlyAt: new Date(),
      })
      .where(eq(leadContactTable.id, contact.id));
  }

  // record the campaign id back onto the program metadata
  await db
    .update(lifecycleProgramTable)
    .set({ metadata: { ...meta, instantlyTestCampaignId: campaign.id } })
    .where(eq(lifecycleProgramTable.id, program.id));
}

console.log(
  "\nAll campaigns created as DRAFT (not launched). Review the rendered copy in",
);
console.log(
  "Instantly, confirm the sending identity, then click Launch to receive the tests.",
);
process.exit(0);
