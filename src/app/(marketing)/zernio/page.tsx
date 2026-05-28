import type { Metadata } from "next";

import { ZernioAccountsList } from "./ZernioAccountsList";
import { ZernioAdComments } from "./ZernioAdComments";
import { ZernioInbox } from "./ZernioInbox";
import { ZernioRecentActivity } from "./ZernioRecentActivity";

export const metadata: Metadata = {
  title: "Zernio",
  description:
    "Unified API for Wander's owned social channels — accounts, posts, analytics.",
};

export default function ZernioPage() {
  return (
    <div className="bg-white px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12">
          <p className="text-sm font-medium tracking-wide text-rose-600 uppercase">
            Read-only
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Zernio
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Unified API for owned social channels — LinkedIn, Facebook, and 13
            more. Read-only surfaces: connected accounts, recent activity with
            metrics, posts with comments, and Meta ad creative comments.
          </p>
        </header>

        <AccountsSection />
        <RecentPostsSection />
        <InboxSection />
        <AdCommentsSection />
      </div>
    </div>
  );
}

function AdCommentsSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
            Ad comments
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Comments on Meta ad creatives (including dark posts) via{" "}
            <code className="font-mono">GET /v1/ads/&#123;adId&#125;/comments</code>
            . High-signal: market-intent feedback like &quot;no inventory in
            Wisconsin&quot;.
          </p>
        </div>
      </div>
      <ZernioAdComments />
    </section>
  );
}

function InboxSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
            Posts with comments
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Posts on connected accounts that have at least one comment, sorted
            by most-commented, via{" "}
            <code className="font-mono">GET /v1/inbox/comments</code>.
          </p>
        </div>
      </div>
      <ZernioInbox />
    </section>
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
