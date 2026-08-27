import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
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

/**
 * The client-facing onboarding page. No login: the token in the URL is the
 * credential. Returning from a platform's OAuth lands here with ?connected=,
 * which triggers a re-sync before the redirect strips the params — so a
 * refresh never re-hits Zernio.
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
      <Shell>
        <h1 className="text-xl font-semibold">This link is no longer active</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Ask your Wander contact for a fresh connection link.
        </p>
      </Shell>
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

  const status = await getBrandConnectStatus(brand.id);
  const remaining = status.filter((row) => !row.connected).length;

  return (
    <Shell>
      <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
        Performance by Wander
      </p>
      <h1 className="mt-2 text-2xl font-semibold">
        Connect {brand.name} to Wander
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Wander&apos;s marketing team runs your campaigns from these accounts.
        You approve each one on the platform&apos;s own login screen —
        we never see your password, and you can revoke access there at any
        time.
      </p>

      <div className="border-border mt-8 divide-y divide-white/5 rounded-xl border">
        {status.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-4 px-4 py-3.5"
          >
            <div>
              <p className="text-sm font-medium">{row.label}</p>
              {row.connected && row.accounts.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {row.accounts.filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            {row.connected ? (
              <span className="text-sm font-medium text-emerald-400">
                Connected ✓
              </span>
            ) : (
              <ConnectButton href={`/connect/${token}/start/${row.key}`} />
            )}
          </div>
        ))}
      </div>

      <p className="text-muted-foreground mt-6 text-xs">
        {remaining === 0
          ? "All set — your Wander contact takes it from here."
          : `${remaining} left. Connect them one by one; each opens the platform's own approval screen.`}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <p className="mb-10 text-lg font-semibold tracking-tight">Wander</p>
        {children}
      </div>
    </main>
  );
}
