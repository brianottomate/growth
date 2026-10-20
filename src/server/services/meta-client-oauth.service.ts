import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { MetaOAuthGrant } from "@/lib/meta-oauth-session";
import { selectMetaSetupAccount } from "@/lib/meta-setup-selection";
import { db } from "@/server/db";
import { adAccountTable, brandTable } from "@/server/db/schema";
import {
  completeMetaConnectSetup,
  saveMetaAccountDestination,
} from "./meta-connect-setup.service";
import {
  getBrandByConnectToken,
  brandConnectUrl,
  brandIntakeUrl,
  syncBrandConnect,
} from "./brand-connect.service";
import {
  listPendingMetaPages,
  finishPendingMetaPage,
  scopeZernioMetaAccount,
  listZernioAccounts,
} from "@/server/clients/zernio.client";

const adAccountSchema = z.object({
  id: z.string().regex(/^act_\d+$/),
  name: z.string(),
  currency: z.string().optional(),
  account_status: z.number().optional(),
});
/** Read only the fresh OAuth token; never enumerate through a stored brand grant. */
async function freshAdAccounts(tempToken: string) {
  const accounts: z.infer<typeof adAccountSchema>[] = [];
  let after: string | undefined;
  do {
    const query = new URLSearchParams({
      fields: "id,name,currency,account_status",
      limit: "100",
    });
    if (after) query.set("after", after);
    const response = await fetch(
      `https://graph.facebook.com/v23.0/me/adaccounts?${query}`,
      {
        headers: { Authorization: `Bearer ${tempToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(
        "Meta could not list accounts for this authorization. Connect again.",
      );
    const page = z
      .object({
        data: z.array(adAccountSchema),
        paging: z
          .object({
            next: z.string().optional(),
            cursors: z.object({ after: z.string().optional() }).optional(),
          })
          .optional(),
      })
      .parse(await response.json());
    accounts.push(...page.data);
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
    if (page.paging?.next && !after)
      throw new Error("Meta account pagination was incomplete. Connect again.");
  } while (after);
  return accounts;
}
export function metaClientReturnUrl(
  token: string,
  returnTo: "connect" | "intake",
) {
  return returnTo === "intake"
    ? `${brandIntakeUrl(token)}?section=connect`
    : brandConnectUrl(token);
}
export async function freshMetaChoices(token: string, grant: MetaOAuthGrant) {
  const brand = await getBrandByConnectToken(token);
  if (!brand || brand.zernioProfileId !== grant.profileId)
    throw new Error("Connect Meta again to continue.");
  const [accounts, pages, registry] = await Promise.all([
    freshAdAccounts(grant.tempToken),
    listPendingMetaPages(grant),
    db.query.adAccountTable.findMany({
      where: eq(adAccountTable.platform, "facebook"),
    }),
  ]);
  const blocked = registry
    .filter((a) => !a.isAllowed || (a.brandId !== brand.id && !a.isShared))
    .map((a) => a.externalId);
  return {
    brand,
    pages,
    blocked,
    accounts: accounts
      .filter((a) => selectMetaSetupAccount([a], a.id, blocked))
      .map((a) => ({
        ...a,
        selectable: [1, 3, 9].includes(a.account_status ?? 0),
      })),
  };
}

export async function finishClientMetaOAuth(
  token: string,
  grant: MetaOAuthGrant,
  adAccountId: string,
  pageId: string,
) {
  const choices = await freshMetaChoices(token, grant);
  const account = selectMetaSetupAccount(
    choices.accounts,
    adAccountId,
    choices.blocked,
  );
  if (!account?.selectable || !choices.pages.some((p) => p.id === pageId))
    throw new Error(
      "Choose an available account and Page from this authorization.",
    );
  // Only after the client's explicit choice does their grant replace the stored connection.
  const result = await finishPendingMetaPage(grant, pageId);
  const provider = z
    .object({
      account: z.object({ accountId: z.string().min(1) }),
    })
    .parse(result);
  const connectionAccountId = await scopeZernioMetaAccount(
    grant.profileId,
    account.id,
    provider.account.accountId,
  );
  const connection = (await listZernioAccounts()).find(
    (a) =>
      (a._id ?? a.id) === connectionAccountId &&
      a.platform === "metaads" &&
      (typeof a.profileId === "string" ? a.profileId : a.profileId?._id) ===
        grant.profileId,
  );
  if (!connection)
    throw new Error(
      "The authorized Meta connection was not created for this brand.",
    );
  await db
    .update(brandTable)
    .set({ metaPageId: pageId })
    .where(
      and(eq(brandTable.id, choices.brand.id), isNull(brandTable.deletedAt)),
    );
  await saveMetaAccountDestination(
    choices.brand.id,
    connectionAccountId,
    account,
  );
  await syncBrandConnect(choices.brand.id);
  // Tracking follows the saved choice. Failure must not ask the client to replay OAuth.
  try {
    await completeMetaConnectSetup(choices.brand.id, {
      clientAdAccountId: account.id,
    });
  } catch {
    /* The shared setup service records the operator follow-up task. */
  }
  return metaClientReturnUrl(token, grant.returnTo);
}
