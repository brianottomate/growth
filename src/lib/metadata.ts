import type { Metadata } from "next";

import { env } from "@/env";

/**
 * Shared metadata for the Wander Growth back-office.
 *
 * Tabs/Slack-unfurls are the real audience here (the app is internal), so every
 * surface routes through `constructMetadata` for a consistent
 * "%s · Wander Growth" title and a branded, dynamically-rendered OG card
 * (see `src/app/api/og`). Indexable showcase pages opt in; everything else can
 * pass `noIndex`.
 */

export const SITE_NAME = "Wander Growth";
export const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;
export const DEFAULT_DESCRIPTION =
  "The Wander growth team's command center — brand, content, lifecycle, and social listening in one place.";

export const baseUrl = env.NEXT_PUBLIC_BASE_URL;

/** Build a URL for the branded OG image route (`/api/og`). */
export function ogImageUrl({
  title,
  eyebrow,
  description,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
}): string {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  if (eyebrow) params.set("eyebrow", eyebrow);
  if (description) params.set("description", description);
  const query = params.toString();
  return query ? `/api/og?${query}` : "/api/og";
}

type ConstructMetadataInput = {
  /** Page title — rendered as `<title> · Wander Growth` via the root template. */
  title?: string;
  description?: string;
  /** Small kicker shown above the title on the OG card (e.g. "Zernio", "Leads"). */
  eyebrow?: string;
  /** Canonical path for OG `url`, e.g. "/zernio". */
  path?: string;
  /** Override the OG image (otherwise a branded card is generated). */
  image?: string;
  /** Keep this surface out of search engines (default for internal pages). */
  noIndex?: boolean;
};

export function constructMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  eyebrow,
  path,
  image,
  noIndex = false,
}: ConstructMetadataInput = {}): Metadata {
  const ogTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const ogImage =
    image ?? ogImageUrl({ title: title ?? SITE_NAME, eyebrow, description });

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      siteName: SITE_NAME,
      type: "website",
      ...(path ? { url: path } : {}),
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [ogImage],
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * Root-layout metadata: sets `metadataBase`, the title template, and branded
 * defaults that every page inherits unless it overrides them.
 */
export const rootMetadata: Metadata = {
  metadataBase: new URL(baseUrl),
  applicationName: SITE_NAME,
  title: { template: TITLE_TEMPLATE, default: SITE_NAME },
  description: DEFAULT_DESCRIPTION,
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: ogImageUrl({ title: SITE_NAME, description: DEFAULT_DESCRIPTION }),
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [
      ogImageUrl({ title: SITE_NAME, description: DEFAULT_DESCRIPTION }),
    ],
  },
};
