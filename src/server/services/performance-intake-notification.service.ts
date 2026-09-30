import "server-only";

import { eq } from "drizzle-orm";

import { env, envSelect } from "@/env";
import { escapeSlackMrkdwn, postOnSlack } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import { performanceIntakeTable } from "@/server/db/schema";

/** Best-effort notification of a saved receipt, run in the route's after(). */
export async function notifyPerformanceIntakeSubmission(
  intakeId: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const intake = await db.query.performanceIntakeTable.findFirst({
        where: eq(performanceIntakeTable.id, intakeId),
        columns: { id: true, submittedAt: true },
        with: { brand: { columns: { id: true, name: true, slug: true } } },
      });
      if (!intake?.brand) {
        console.error(
          "Performance intake notification: receipt or brand missing",
          { intakeId },
        );
        return;
      }

      const { brand, submittedAt } = intake;
      // Also neutralize bare @here/@channel in Slack's automatic parsing.
      const brandName = escapeSlackMrkdwn(brand.name).replace(/@/g, "@\u200b");
      const micaela = envSelect({ prod: "<@U0574R1RCD9>", test: "Micaela" });
      const url = brand.slug
        ? `${env.NEXT_PUBLIC_BASE_URL}/app/performance/brands/${encodeURIComponent(brand.slug)}#submission`
        : `${env.NEXT_PUBLIC_BASE_URL}/app/performance/clients`;
      const linkLabel = brand.slug ? "View submission" : "View clients";
      const timestamp = `<!date^${Math.floor(submittedAt.getTime() / 1000)}^{date_short_pretty} at {time}|${submittedAt.toISOString()}>`;
      const text = `Performance onboarding submitted: ${brandName}\nSubmitted ${timestamp}\n${micaela} <${url}|${linkLabel}>`;
      const result = await postOnSlack({
        channel: "C0BSSECHK08", // #team-performance
        text,
        blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
        unfurl_links: false,
        unfurl_media: false,
      });
      if (!result.success) throw new Error(result.error);
      return;
    } catch (error) {
      console.error("Performance intake notification failed", {
        intakeId,
        attempt,
        final: attempt === 3,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    if (attempt < 3) {
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}
