import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { Logo } from "@wandercom/design-system-web/ui/logo";

import { db } from "@/server/db";
import {
  performanceAccountTable,
  performancePropertyTable,
} from "@/server/db/schema";
import { getBrandByConnectToken } from "@/server/services/brand-connect.service";

import { IntakeForm, type IntakeSeed } from "../IntakeForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Let's get your ads live · Wander",
  robots: { index: false, follow: false },
};

/**
 * The real intake, addressed by the brand's connect token — the same
 * credential /connect/[token] uses, so one link per client covers both and
 * revoking it revokes both.
 *
 * Prefill comes from what we already hold. Homes already on the commercial
 * record are offered as tick boxes; a client with none types them, and the
 * WanderOS listing pull replaces that later without changing the form.
 */
export default async function TokenIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const brand = await getBrandByConnectToken(token);
  if (!brand) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="max-w-sm text-center">
          <Logo variant="logomark" className="mx-auto mb-6 h-10 w-auto" />
          <h1 className="text-xl font-semibold">
            This link is no longer active
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Ask your Wander contact for a fresh one.
          </p>
        </div>
      </main>
    );
  }

  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brand.id),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true, contactName: true, contactEmail: true },
  });

  const properties = account
    ? await db.query.performancePropertyTable.findMany({
        where: and(
          eq(performancePropertyTable.accountId, account.id),
          isNull(performancePropertyTable.deletedAt),
        ),
        columns: { title: true },
      })
    : [];

  const seed: IntakeSeed = {
    brand: brand.name,
    contact: account?.contactName ?? brand.connectTokenIssuedByName ?? "there",
    email: account?.contactEmail ?? brand.connectTokenIssuedByEmail ?? "",
    site: brand.website ?? "",
    properties: properties
      .map((row) => row.title)
      .filter((title): title is string => Boolean(title)),
    leadsieUrl: "https://app.leadsie.com/connect/wander",
    repName: brand.connectTokenIssuedByName?.split(" ")[0] ?? "Your Wander contact",
    repEmail: brand.connectTokenIssuedByEmail ?? "growth@wander.com",
  };

  return <IntakeForm seed={seed} token={token} />;
}
