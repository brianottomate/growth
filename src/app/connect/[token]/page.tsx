import { ClientPageViewBeacon } from "@/components/client-page/ClientPageViewBeacon";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getBrandByConnectToken,
  getBrandConnectStatus,
  syncBrandConnect,
} from "@/server/services/brand-connect.service";

import { ConnectView, InactiveConnect } from "./ConnectView";
import { getMetaConnectChoice } from "@/server/services/meta-connect-setup.service";
import { loadPerformanceConnections } from "@/server/services/performance-connections.service";
import { intakeSetupSummary } from "@/lib/intake-setup-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect your accounts · Wander",
  robots: { index: false, follow: false },
};

/**
 * The client-facing onboarding page. No login: the token in the URL is the
 * credential. Returning from a platform's OAuth lands here with ?connected=,
 * which triggers a re-sync before the redirect strips the params, so a
 * refresh never re-hits Zernio.
 *
 * This is the only Wander surface most clients ever see, so it carries the
 * brand and the reasoning, not just four buttons. Split on desktop, with
 * Wander's story on the left and the task on the right. Stacked on mobile
 * with the task first, because on a phone this is a two-minute errand.
 */
export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const brand = await getBrandByConnectToken(token);
  if (!brand) {
    return <InactiveConnect />;
  }

  const query = await searchParams;
  if (query.connected && !query.error) {
    try {
      await syncBrandConnect(
        brand.id,
        [query.connected]
          .flat()
          .some((value) => value === "meta-ads" || value === "metaads"),
      );
    } catch (error) {
      console.error("brand connect sync failed", error);
    }
    redirect(`/connect/${token}`);
  }

  // Only what we currently ask for. A parked channel a brand already has
  // stays connected and stays visible internally; it just is not on the list
  // we hand the client.
  const status = (await getBrandConnectStatus(brand.id)).filter(
    (row) => row.offered,
  );
  const metaConnected = status.some(
    (row) => row.key === "meta-ads" && row.connected,
  );
  let metaChoice: Awaited<ReturnType<typeof getMetaConnectChoice>> = null;
  let metaUnavailable = false;
  let setupChecks: ReturnType<typeof intakeSetupSummary>["checks"] = [];
  if (metaConnected) {
    try {
      metaChoice = await getMetaConnectChoice(brand.id);
      if (!metaChoice) metaUnavailable = true;
      const summary = (
        await loadPerformanceConnections(brand.organizationId!, [brand.id])
      ).get(brand.id);
      if (summary)
        setupChecks = intakeSetupSummary(
          summary,
          "unknown",
          "unknown",
          true,
        ).checks.filter((check) =>
          ["meta", "billing", "pixel"].includes(check.key),
        );
    } catch (error) {
      console.error("Connect account choice unavailable", {
        brandId: brand.id,
        error,
      });
      metaUnavailable = true;
    }
  }
  const allDone =
    status.every((row) => row.connected) &&
    Boolean(metaChoice?.selectedId) &&
    setupChecks.length > 0 &&
    setupChecks.every((check) => check.state === "ready");
  const contactName = brand.connectTokenIssuedByName?.split(" ")[0] || null;
  const contactEmail = brand.connectTokenIssuedByEmail;

  return (
    <ConnectView
      token={token}
      brand={brand}
      status={status}
      metaConnected={metaConnected}
      metaChoice={metaChoice}
      metaUnavailable={metaUnavailable}
      setupChecks={setupChecks}
      allDone={allDone}
      contactName={contactName}
      contactEmail={contactEmail}
      error={Boolean(query.error)}
      selectionReview={query.selection === "review"}
    >
      <ClientPageViewBeacon
        endpoint={`/connect/${token}/view`}
        sessionKey={`social-connect:${token}`}
      />
    </ConnectView>
  );
}
