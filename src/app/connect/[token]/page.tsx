import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@wandercom/design-system-web/ui/logo";

import {
  type BrandConnectChannelKey,
  getBrandByConnectToken,
  getBrandConnectStatus,
  syncBrandConnect,
} from "@/server/services/brand-connect.service";

import { ConnectButton } from "./ConnectButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect your accounts · Wander",
  robots: { index: false, follow: false },
};

/** What clicking Connect actually does, per platform, in the client's words. */
const WHAT_HAPPENS: Record<BrandConnectChannelKey, string> = {
  instagram: "Opens Instagram's approval screen",
  facebook: "Opens Facebook's approval screen",
  "meta-ads": "Opens Meta Business approval",
  "google-ads": "Opens Google's approval screen",
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
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="max-w-sm text-center">
          <Logo variant="logomark" className="mx-auto mb-6 h-10 w-auto" />
          <h1 className="text-xl font-semibold">
            This link is no longer active
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Ask your Wander contact for a fresh connection link.
          </p>
        </div>
      </main>
    );
  }

  const query = await searchParams;
  if (query.connected) {
    try {
      await syncBrandConnect(brand.id);
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
  const done = status.filter((row) => row.connected).length;
  const allDone = done === status.length;
  const contactName = brand.connectTokenIssuedByName?.split(" ")[0] || null;
  const contactEmail = brand.connectTokenIssuedByEmail;

  return (
    <main className="flex min-h-screen flex-col lg:grid lg:grid-cols-[minmax(0,26rem)_1fr]">
      {/* Wander's half. Second in the DOM order that matters on mobile: it
          renders below the task, so a phone opens on the four buttons. */}
      <aside className="order-2 flex flex-col justify-between gap-10 border-t px-6 py-10 lg:order-1 lg:min-h-screen lg:border-t-0 lg:border-r lg:px-10 lg:py-12">
        <div>
          <Logo variant="wordmark" className="h-5 w-auto" />
          <Logo
            variant="logomark"
            aria-hidden
            className="mt-10 hidden h-14 w-auto opacity-90 lg:block"
          />
          <h2 className="mt-8 text-2xl leading-tight font-semibold tracking-tight">
            Your marketing,
            <br />
            run by Wander.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Wander&apos;s growth team plans and runs paid campaigns for{" "}
            {brand.name} across Facebook, Instagram, Google and ChatGPT. Your ad
            accounts are what that runs on. Connecting them is how we build,
            launch and report on the ads.
          </p>
          <ol className="mt-8 space-y-4">
            {[
              "You approve each platform on its own login screen",
              "We never see your password, and you can revoke access anytime",
              "Your Wander contact confirms once everything's flowing",
            ].map((line, index) => (
              <li key={line} className="flex gap-3">
                <span className="border-border text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-medium">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed">{line}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-muted-foreground text-xs">Find your happy place ®</p>
      </aside>

      <section className="order-1 px-6 py-10 lg:order-2 lg:px-12 lg:py-16">
        <div className="mx-auto w-full max-w-lg">
          <div className="flex items-center gap-2.5">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo}
                alt=""
                className="size-8 rounded-lg border object-cover"
              />
            ) : (
              <span className="bg-muted grid size-8 place-items-center rounded-lg text-xs font-semibold">
                {brand.name.slice(0, 2)}
              </span>
            )}
            <span className="text-sm font-medium">{brand.name}</span>
            {contactName && (
              <span className="text-muted-foreground truncate text-sm">
                · invited by {contactName} at Wander
              </span>
            )}
          </div>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Connect your accounts
          </h1>

          <div
            className="mt-5 flex gap-1.5"
            role="img"
            aria-label={`${done} of ${status.length} accounts connected`}
          >
            {status.map((row) => (
              <span
                key={row.key}
                className={`h-1 flex-1 rounded-full ${
                  row.connected ? "bg-emerald-400" : "bg-white/10"
                }`}
              />
            ))}
          </div>

          <div className="border-border mt-6 divide-y divide-white/5 rounded-xl border">
            {status.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-4 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {row.connected
                      ? [
                          row.accounts.filter(Boolean).length > 0
                            ? `Connected as ${row.accounts.filter(Boolean).join(", ")}`
                            : "Connected",
                          ...row.externalIds.map(shortAccountId),
                        ].join(" · ")
                      : WHAT_HAPPENS[row.key]}
                  </p>
                </div>
                {row.connected ? (
                  <span className="shrink-0 text-sm font-medium text-emerald-400">
                    Connected ✓
                  </span>
                ) : (
                  <ConnectButton href={`/connect/${token}/start/${row.key}`} />
                )}
              </div>
            ))}
          </div>

          <div className="text-muted-foreground mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            {[
              "No password shared",
              "Revoke anytime",
              "Approved on each platform",
            ].map((chip) => (
              <span key={chip} className="flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                {chip}
              </span>
            ))}
          </div>

          <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
            {allDone
              ? `All set. ${contactName ?? "Your Wander contact"} takes it from here.`
              : "Takes about two minutes. Stuck on one? Skip it and get in touch."}
            {contactEmail && (
              <>
                {" "}
                Questions?{" "}
                <a href={`mailto:${contactEmail}`} className="underline">
                  {contactEmail}
                </a>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}

/** `act_1877763863159956` reads as `act_1877…9956`, enough to recognise. */
function shortAccountId(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
