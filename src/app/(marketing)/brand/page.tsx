import Link from "next/link";
import { constructMetadata } from "@/lib/metadata";

export const metadata = constructMetadata({
  title: "Brand directory",
  eyebrow: "Brands",
  path: "/brand",
  description:
    "Internal directory of Wander's brands, owned social accounts, ad accounts, and Reddit presence.",
});

type SocialAccount = {
  platform: string;
  handle: string;
  url: string;
};

type Brand = {
  name: string;
  blurb: string;
  accounts: SocialAccount[];
};

const BRANDS: Brand[] = [
  {
    name: "Wander (marketplace)",
    blurb: "Consumer-facing vacation rental marketplace.",
    accounts: [
      {
        platform: "Instagram",
        handle: "@wander",
        url: "https://www.instagram.com/wander/",
      },
      {
        platform: "Facebook",
        handle: "wanderfb",
        url: "https://www.facebook.com/wanderfb/",
      },
      {
        platform: "TikTok",
        handle: "@wander",
        url: "https://www.tiktok.com/@wander",
      },
      {
        platform: "X",
        handle: "@wander",
        url: "https://x.com/wander",
      },
      {
        platform: "LinkedIn",
        handle: "wandercom",
        url: "https://www.linkedin.com/company/wandercom/",
      },
      {
        platform: "Pinterest",
        handle: "Wander",
        url: "https://www.pinterest.com/wander/",
      },
    ],
  },
  {
    name: "WanderOS",
    blurb: "B2B platform for property managers and hosts.",
    accounts: [
      {
        platform: "Instagram",
        handle: "@wanderoshq",
        url: "https://www.instagram.com/wanderoshq",
      },
      {
        platform: "Facebook",
        handle: "WanderOS",
        url: "https://www.facebook.com/people/WanderOS/61587757306524/",
      },
    ],
  },
];

type AdAccount = {
  platform: string;
  label: string;
  note: string;
  url?: string;
};

const AD_ACCOUNTS: AdAccount[] = [
  {
    platform: "Google Ads",
    label: "Demand + supply MCC",
    note: "Manager account covering both marketplace demand and supply campaigns.",
    url: "https://ads.google.com",
  },
  {
    platform: "ChatGPT Ads",
    label: "OpenAI",
    note: "Sponsored placements inside ChatGPT — early access.",
    url: "https://ads.openai.com/",
  },
];

type RedditEntry = {
  label: string;
  note: string;
  url?: string;
};

const REDDIT_ENTRIES: RedditEntry[] = [
  {
    label: "u/wander (organic)",
    note: "Organic presence — used for engaging on STR-operator subs (see /growth).",
    url: "https://www.reddit.com/user/wander/",
  },
  {
    label: "Reddit Ads",
    note: "Paid placements targeting STR-operator and travel subs.",
    url: "https://ads.reddit.com/account/ip81tgrrk9t6/dashboard",
  },
];

// Duplicated from /growth — Tier 1 subs the cron polls.
const SUBREDDITS = [
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
];

export default function BrandPage() {
  return (
    <div className="bg-white px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12">
          <p className="text-sm font-medium tracking-wide text-rose-600 uppercase">
            Internal directory
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Brand
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Source of truth for Wander&apos;s brands, owned social accounts, ad
            accounts, and Reddit presence. Lean directory — no integrations,
            just links.
          </p>
        </header>

        <BrandsSection />
        <AdsSection />
        <RedditSection />
      </div>
    </div>
  );
}

function BrandsSection() {
  return (
    <section className="border-t border-gray-200 pt-12">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Brands
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Owned social accounts for each brand.
        </p>
      </div>

      <div className="space-y-8">
        {BRANDS.map((brand) => (
          <div
            key={brand.name}
            className="rounded-2xl border border-gray-200 bg-white p-6"
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {brand.name}
              </h3>
              <p className="mt-1 text-sm text-gray-600">{brand.blurb}</p>
            </div>
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
              {brand.accounts.map((account) => (
                <li
                  key={`${brand.name}-${account.platform}-${account.url}`}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {account.platform}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-gray-500">
                      {account.handle}
                    </p>
                  </div>
                  <a
                    href={account.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
                  >
                    open ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdsSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Ads
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Paid acquisition surfaces that aren&apos;t tied to a single owned
          brand account.
        </p>
      </div>

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {AD_ACCOUNTS.map((account) => (
          <li
            key={`${account.platform}-${account.label}`}
            className="flex items-start justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {account.platform}
              </p>
              <p className="mt-0.5 font-mono text-xs text-gray-500">
                {account.label}
              </p>
              <p className="mt-1 text-sm text-gray-600">{account.note}</p>
            </div>
            {account.url ? (
              <a
                href={account.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
              >
                open ↗
              </a>
            ) : (
              <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500">
                no link
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RedditSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Reddit
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Reddit is broken out separately — organic engagement and paid live
          side by side here.
        </p>
      </div>

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {REDDIT_ENTRIES.map((entry) => (
          <li
            key={entry.label}
            className="flex items-start justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {entry.label}
              </p>
              <p className="mt-1 text-sm text-gray-600">{entry.note}</p>
            </div>
            {entry.url ? (
              <a
                href={entry.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
              >
                open ↗
              </a>
            ) : (
              <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500">
                no link
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900">
          Subreddits monitored
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Tier 1 STR-operator subs we monitor — via F5Bot keyword alerts plus
          the on-demand live scan. Duplicated from{" "}
          <Link href="/growth" className="font-mono hover:text-rose-600">
            /growth
          </Link>
          .
        </p>
        <ul className="mt-3 space-y-1 text-sm text-gray-700">
          {SUBREDDITS.map((sub) => (
            <li key={sub}>
              <a
                href={`https://reddit.com/r/${sub}`}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono hover:text-rose-600"
              >
                r/{sub}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
