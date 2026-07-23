import { env } from "@/env";

// wander.com blog lives in DatoCMS. The read mirror (scripts/import-blog.ts)
// uses the public Content Delivery API; this client is the WRITE side, using
// the Content Management API. Scope is deliberately narrow: resolve a model,
// upload an asset from a URL, create a DRAFT item. Publishing stays a human
// action in the Dato editor until the team decides otherwise.

const BASE = "https://site-api.datocms.com";

export const isDatoCmsConfigured = Boolean(env.DATOCMS_CMA_TOKEN);

function headers(): Record<string, string> {
  if (!env.DATOCMS_CMA_TOKEN) {
    throw new Error("DATOCMS_CMA_TOKEN is not configured.");
  }
  return {
    Authorization: `Bearer ${env.DATOCMS_CMA_TOKEN}`,
    Accept: "application/json",
    "Content-Type": "application/vnd.api+json",
    "X-Api-Version": "3",
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DatoCMS ${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

type JsonApi<T> = { data: T };

export async function resolveItemTypeId(apiKey: string): Promise<string> {
  const { data } = await request<
    JsonApi<Array<{ id: string; attributes: { api_key: string } }>>
  >("/item-types");
  const match = data.find((type) => type.attributes.api_key === apiKey);
  if (!match) throw new Error(`DatoCMS model not found: ${apiKey}`);
  return match.id;
}

/** The project's admin domain, for deep links into the editor. */
export async function resolveAdminDomain(): Promise<string | null> {
  try {
    const { data } = await request<
      JsonApi<{ attributes: { internal_domain: string | null } }>
    >("/site");
    return data.attributes.internal_domain;
  } catch {
    return null;
  }
}

/**
 * Upload an asset into Dato's media area from a public URL. The CMA has no
 * direct from-URL create: we fetch the bytes, PUT them to the presigned S3
 * target from an upload-request, then create the upload from that path
 * (which may return an async job we poll).
 */
export async function createUploadFromUrl(
  url: string,
  filename?: string,
): Promise<string> {
  const source = await fetch(url);
  if (!source.ok) throw new Error(`Hero fetch failed: ${source.status} ${url}`);
  const bytes = Buffer.from(await source.arrayBuffer());
  const name =
    filename ??
    new URL(url).pathname.split("/").pop()?.slice(0, 100) ??
    "upload";

  const uploadRequest = await request<
    JsonApi<{
      id: string;
      attributes: { url: string; request_headers: Record<string, string> };
    }>
  >("/upload-requests", {
    method: "POST",
    body: JSON.stringify({
      data: { type: "upload_request", attributes: { filename: name } },
    }),
  });

  const putRes = await fetch(uploadRequest.data.attributes.url, {
    method: "PUT",
    headers: {
      ...uploadRequest.data.attributes.request_headers,
      "Content-Type":
        source.headers.get("content-type") ?? "application/octet-stream",
    },
    body: bytes,
  });
  if (!putRes.ok) throw new Error(`S3 PUT for Dato upload failed: ${putRes.status}`);

  const job = await request<JsonApi<{ id: string; type: string }>>("/uploads", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "upload",
        attributes: { path: uploadRequest.data.id },
      },
    }),
  });
  // A 202 returns a job; a 201 (rare) returns the upload directly.
  if (job.data.type === "upload") return job.data.id;

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await fetch(`${BASE}/job-results/${job.data.id}`, {
      headers: headers(),
    });
    if (res.status === 404) continue; // still processing
    if (!res.ok) throw new Error(`DatoCMS job poll → ${res.status}`);
    const payload = (await res.json()) as {
      data: { attributes: { status: number; payload?: { data?: { id?: string } } } };
    };
    const { status, payload: result } = payload.data.attributes;
    if (status >= 200 && status < 300 && result?.data?.id) {
      return result.data.id;
    }
    throw new Error(`DatoCMS upload failed (job status ${status}).`);
  }
  throw new Error("DatoCMS upload timed out.");
}

/** Fetch a single item (draft content included — the CMA always sees the
 * current version, which is exactly what a draft preview needs). */
export async function getItem(itemId: string): Promise<{
  id: string;
  attributes: Record<string, unknown>;
  meta: { status: string };
}> {
  const { data } = await request<
    JsonApi<{
      id: string;
      attributes: Record<string, unknown>;
      meta: { status: string };
    }>
  >(`/items/${itemId}?version=current`);
  return data;
}

/** Resolve an upload's public CDN URL. */
export async function getUploadUrl(uploadId: string): Promise<string | null> {
  try {
    const { data } = await request<
      JsonApi<{ attributes: { url: string | null } }>
    >(`/uploads/${uploadId}`);
    return data.attributes.url;
  } catch {
    return null;
  }
}

/** Resolve a blog author item by (case-insensitive) name. */
export async function findAuthorIdByName(name: string): Promise<string | null> {
  const authorTypeId = await resolveItemTypeId("blog_author");
  const { data } = await request<
    JsonApi<Array<{ id: string; attributes: { name?: string } }>>
  >(`/items?filter[type]=${authorTypeId}&page[limit]=100`);
  const needle = name.trim().toLowerCase();
  return (
    data.find((item) => item.attributes.name?.trim().toLowerCase() === needle)
      ?.id ?? null
  );
}

/** Create an item as a DRAFT (Dato items start unpublished via the CMA). */
export async function createDraftItem(input: {
  itemTypeId: string;
  attributes: Record<string, unknown>;
}): Promise<{ id: string }> {
  const { data } = await request<JsonApi<{ id: string }>>("/items", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "item",
        attributes: input.attributes,
        relationships: {
          item_type: { data: { type: "item_type", id: input.itemTypeId } },
        },
      },
    }),
  });
  return { id: data.id };
}
