import "server-only";

import { env } from "@/env";

// DatoCMS Content Delivery API (read side), the same API wander.com renders
// from. The CMA client next door is the WRITE side.
//
// Why this exists alongside datocms.client.ts: the CMA returns raw DAST with
// blocks inlined, which then has to be hand-normalized before any renderer
// will take it. The CDA returns structured text already in the shape
// `{ value, blocks }` that react-datocms' <StructuredText> expects — no
// translation. With `X-Include-Drafts` it also serves the *current* (draft)
// version, which is exactly what a preview needs.

const ENDPOINT = "https://graphql.datocms.com/";

export const isDatoCdaConfigured = Boolean(env.DATOCMS_CMA_TOKEN);

export async function datoQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { includeDrafts?: boolean } = {},
): Promise<T> {
  if (!env.DATOCMS_CMA_TOKEN) {
    throw new Error("DatoCMS is not configured (DATOCMS_CMA_TOKEN).");
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DATOCMS_CMA_TOKEN}`,
      "Content-Type": "application/json",
      // Serve the draft version of every record, not just published ones.
      ...(options.includeDrafts ? { "X-Include-Drafts": "true" } : {}),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `DatoCMS CDA ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  const payload = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(
      `DatoCMS CDA errors: ${payload.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!payload.data) throw new Error("DatoCMS CDA returned no data.");
  return payload.data;
}

/** An image as the CDA returns it. */
export type DatoImage = {
  url: string;
  width: number | null;
  height: number | null;
  alt: string | null;
};

/** Blocks we know how to render; mirrors wander.com's renderBlock cases. */
export type KnownBlock =
  | { __typename: "VideoEmbedRecord"; id: string; url: string | null }
  | { __typename: "BlogImageRecord"; id: string; image: DatoImage | null }
  | { __typename: "TableRecord"; id: string; table: unknown }
  | { __typename: "InstagramEmbedRecord"; id: string; url: string | null };

/**
 * What the CDA can actually hand us: a block we know, or one added to the
 * model since this was written. Kept separate from `KnownBlock` so the
 * renderer can switch over a real discriminated union and still have a
 * default case for the unknown ones.
 */
export type DatoBlock = KnownBlock | { __typename: string; id: string };

export type BlogArticleDraft = {
  id: string;
  title: string | null;
  description: string | null;
  url: string | null;
  _status: string;
  image: DatoImage | null;
  body: { value: unknown; blocks: DatoBlock[] } | null;
};

const ARTICLE_QUERY = `
  query BlogArticleDraft($id: ItemId) {
    blogArticle(filter: { id: { eq: $id } }) {
      id
      title
      description
      url
      _status
      image { url width height alt }
      body {
        value
        blocks {
          __typename
          ... on VideoEmbedRecord { id url }
          ... on BlogImageRecord { id image { url width height alt } }
          ... on TableRecord { id table }
          ... on InstagramEmbedRecord { id url }
        }
      }
    }
  }
`;

/** Fetch one blog article by record id, draft version included. */
export async function getBlogArticleDraft(
  id: string,
): Promise<BlogArticleDraft | null> {
  const data = await datoQuery<{ blogArticle: BlogArticleDraft | null }>(
    ARTICLE_QUERY,
    { id },
    { includeDrafts: true },
  );
  return data.blogArticle;
}
