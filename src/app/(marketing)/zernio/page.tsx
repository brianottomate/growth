import Link from "next/link";

import { constructMetadata } from "@/lib/metadata";

import { ZernioAccountsList } from "./ZernioAccountsList";
import { ZernioRecentActivity } from "./ZernioRecentActivity";

export const metadata = constructMetadata({
  title: "Zernio",
  eyebrow: "Zernio",
  path: "/zernio",
  description:
    "Unified API for Wander's owned social channels — accounts, posts, analytics.",
});

export default function ZernioPage() {
  return (
    <div className="bg-white px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12">
          <p className="text-sm font-medium tracking-wide text-rose-600 uppercase">
            Read-only · API showcase
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Zernio
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Raw look at the Zernio API for owned social channels — connected
            accounts and recent activity with metrics. The team-facing listening
            surfaces (comments, ad comments) now live in{" "}
            <Link href="/app/listen" className="text-rose-600 hover:underline">
              Listen
            </Link>
            .
          </p>
        </header>

        <AccountsSection />
        <RecentPostsSection />
      </div>
    </div>
  );
}

function AccountsSection() {
  return (
    <section className="border-t border-gray-200 pt-12">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
            Connected accounts
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Fetched server-side via{" "}
            <code className="font-mono">GET /v1/accounts</code>.
          </p>
        </div>
      </div>
      <ZernioAccountsList />
    </section>
  );
}

function RecentPostsSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
            Recent activity
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            All posts on connected accounts in the last 30 days via{" "}
            <code className="font-mono">
              GET /v1/analytics?platform=…
            </code>
            . Includes posts published outside of Zernio.
          </p>
        </div>
      </div>
      <ZernioRecentActivity />
    </section>
  );
}
