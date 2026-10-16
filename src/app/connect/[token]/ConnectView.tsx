import { Logo } from "@wandercom/design-system-web/ui/logo";

import type { IntakeSetupCheck } from "@/lib/intake-setup-status";
import type {
  BrandConnectChannelKey,
  getBrandConnectStatus,
} from "@/server/services/brand-connect.service";
import type { getMetaConnectChoice } from "@/server/services/meta-connect-setup.service";

import { ConnectButton } from "./ConnectButton";
import { MetaAccountChoice } from "./MetaAccountChoice";

/** What clicking Connect actually does, per platform, in the client's words. */
const WHAT_HAPPENS: Record<BrandConnectChannelKey, string> = {
  instagram: "Opens Instagram's approval screen",
  facebook: "Opens Facebook's approval screen",
  "meta-ads": "Opens Meta Business approval",
  "google-ads": "Opens Google's approval screen",
  "linkedin-ads":
    "Opens LinkedIn's approval screen, or connects straight away if your Page already is",
};

export type ConnectViewProps = {
  token: string;
  brand: { name: string; logo: string | null };
  status: Awaited<ReturnType<typeof getBrandConnectStatus>>;
  metaConnected: boolean;
  metaChoice: Awaited<ReturnType<typeof getMetaConnectChoice>>;
  metaUnavailable: boolean;
  setupChecks: IntakeSetupCheck[];
  allDone: boolean;
  contactName: string | null;
  contactEmail: string | null;
  error: boolean;
  selectionReview: boolean;
  children?: React.ReactNode;
};

/**
 * The connect page's markup, apart from the data loading, so /lab/intake can
 * render the same screen from fixtures.
 */
export function ConnectView({
  token,
  brand,
  status,
  metaConnected,
  metaChoice,
  metaUnavailable,
  setupChecks,
  allDone,
  contactName,
  contactEmail,
  error,
  selectionReview,
  children,
}: ConnectViewProps) {
  return (
    <main className="flex min-h-screen flex-col lg:grid lg:grid-cols-[minmax(0,26rem)_1fr]">
      {children}
      {/* Wander's half. Second in the DOM order that matters on mobile: it
          renders below the task, so a phone opens on the four buttons. */}
      <aside className="order-2 flex flex-col justify-between gap-10 border-t px-6 py-10 lg:order-1 lg:min-h-screen lg:border-t-0 lg:border-r lg:px-10 lg:py-12">
        <div>
          <Logo variant="logo" className="h-6 w-auto" />
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
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
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
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-[11px] font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed">{line}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">Find your happy place ®</p>
      </aside>

      <section className="order-1 px-6 py-10 lg:order-2 lg:px-12 lg:py-16">
        <div className="mx-auto w-full max-w-lg">
          <div className="flex items-center gap-2.5">
            {brand.logo ? (
              // oxlint-disable-next-line nextjs/no-img-element
              <img
                src={brand.logo}
                alt=""
                className="size-8 rounded-lg border object-cover"
              />
            ) : (
              <span className="grid size-8 place-items-center rounded-lg bg-muted text-xs font-semibold">
                {brand.name.slice(0, 2)}
              </span>
            )}
            <span className="text-sm font-medium">{brand.name}</span>
            {contactName && (
              <span className="truncate text-sm text-muted-foreground">
                · invited by {contactName} at Wander
              </span>
            )}
          </div>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Connect your accounts
          </h1>

          {error && (
            <p role="alert" className="mt-4 text-sm">
              The account connection did not finish. Try connecting again or ask
              your Wander contact for help.
            </p>
          )}
          <div className="mt-6 divide-y divide-white/5 rounded-xl border border-border">
            {status.map((row) => (
              <div key={row.key} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
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
                    <ConnectButton
                      href={`/connect/${token}/start/${row.key}`}
                    />
                  )}
                </div>
                {row.key === "meta-ads" && metaConnected && (
                  <div
                    className="mt-4 space-y-4 border-t border-white/5 pt-4"
                    aria-label="Meta ad account and setup"
                  >
                    {metaUnavailable ? (
                      <p className="text-sm">
                        We could not load your ad accounts. Refresh this page to
                        try again, or contact your Wander team.
                      </p>
                    ) : metaChoice?.accounts.length ? (
                      <MetaAccountChoice
                        token={token}
                        brandName={brand.name}
                        choice={metaChoice}
                      />
                    ) : (
                      <p className="text-sm">
                        No available ad accounts were found. Ask your business
                        administrator to grant access to the correct account,
                        then reconnect Meta.
                      </p>
                    )}
                    {selectionReview && (
                      <p role="status" className="text-sm">
                        Setup could not finish automatically. Review the status
                        below or contact your Wander team; your account may
                        still need Page, billing or tracking setup.
                      </p>
                    )}
                    {setupChecks.length > 0 && (
                      <ul className="space-y-3" aria-label="Meta setup checks">
                        {setupChecks.map((check) => (
                          <li key={check.key} className="text-sm">
                            <p className="font-medium">
                              {check.label}:{" "}
                              {check.state === "ready"
                                ? "Ready"
                                : check.state === "unknown"
                                  ? "Not verified"
                                  : check.state === "action_required"
                                    ? "Action needed"
                                    : "Setup pending"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {check.detail}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
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

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            {allDone
              ? `Your advertising accounts are connected and the listed Meta setup checks are ready. ${contactName ?? "Your Wander contact"} will review your launch.`
              : "Connected means access was approved. Choose your Meta ad account above and review any remaining setup. Stuck? Get in touch."}
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

export function InactiveConnect() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-sm text-center">
        <Logo variant="logomark" className="mx-auto mb-6 h-10 w-auto" />
        <h1 className="text-xl font-semibold">This link is no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask your Wander contact for a fresh connection link.
        </p>
      </div>
    </main>
  );
}

/** `act_1877763863159956` reads as `act_1877…9956`, enough to recognise. */
function shortAccountId(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
