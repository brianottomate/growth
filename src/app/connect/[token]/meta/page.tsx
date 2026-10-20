import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getBrandByConnectToken } from "@/server/services/brand-connect.service";
import { metaOAuthSession } from "@/server/services/meta-oauth-cookie";
import {
  freshMetaChoices,
  metaClientReturnUrl,
} from "@/server/services/meta-client-oauth.service";
import { MetaOAuthChoice } from "./MetaOAuthChoice";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Connect Meta · Wander",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function MetaChoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const brand = await getBrandByConnectToken(token);
  if (!brand)
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold">
          This link is no longer active
        </h1>
      </main>
    );
  const session = await metaOAuthSession(token);
  let choices: Awaited<ReturnType<typeof freshMetaChoices>> | null = null;
  if (session?.phase === "grant") {
    try {
      choices = await freshMetaChoices(token, session);
    } catch {
      /* Only a new authorization can provide the picker. */
    }
  }
  const returnTo = session?.returnTo ?? "intake";
  const error = (await searchParams).error;
  const pageId = choices?.pages.some((p) => p.id === brand.metaPageId)
    ? brand.metaPageId!
    : choices?.pages.length === 1
      ? choices.pages[0]!.id
      : "";
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <p className="text-sm text-muted-foreground">Wander · {brand.name}</p>
      <h1 className="mt-5 text-2xl font-semibold">
        {choices ? "Choose your Meta ad account" : "Connect your Meta account"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {choices
          ? "These accounts and Pages come from the Meta authorization you just completed. Choose the ones for your brand."
          : "Sign in to Meta, then choose the ad account that will run your brand’s ads."}
      </p>
      {choices ? (
        <MetaOAuthChoice
          token={token}
          accounts={choices.accounts}
          pages={choices.pages}
          pageId={pageId}
        />
      ) : (
        <div className="mt-6 space-y-4">
          {(error || session?.phase === "grant") && (
            <p role="alert" className="text-sm">
              The authorization could not be completed. Please connect again.
            </p>
          )}
          <Button asChild>
            <Link
              prefetch={false}
              href={`/connect/${token}/meta/start?returnTo=${returnTo}`}
            >
              Connect Meta
            </Link>
          </Button>
        </div>
      )}
      <p className="mt-6">
        <a
          className="text-sm underline"
          href={metaClientReturnUrl(token, returnTo)}
        >
          Back to your setup
        </a>
      </p>
    </main>
  );
}
