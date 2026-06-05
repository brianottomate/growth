import { env } from "@/env";

/**
 * Search/research provider clients used by lead discovery.
 *
 * All are thin raw-`fetch` wrappers (no SDKs) so they stay uniform and
 * dep-free. Each throws on failure; the discovery service wraps every call in
 * a per-provider envelope so one failing provider never sinks the others.
 *
 * Call signatures mirror proven usage in sibling repos:
 *   - Parallel  → boe-ventures/native parallel-ai.service.ts (v1beta/search)
 *   - Perplexity→ boe-ventures/wepost-saga (sonar models)
 *   - Exa       → boe-ventures/homi exa.client.ts (search + contents)
 */

export const isPerplexityConfigured = !!env.PERPLEXITY_API_KEY;
export const isTavilyConfigured = !!env.TAVILY_API_KEY;
export const isParallelConfigured = !!env.PARALLEL_API_KEY;
export const isExaConfigured = !!env.EXA_API_KEY;

// ---- Perplexity (sonar web search) ---------------------------------

export type PerplexityResult = {
  content: string;
  citations: string[];
};

export async function perplexitySearch(
  prompt: string,
  opts?: { model?: string },
): Promise<PerplexityResult> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts?.model ?? "sonar",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    citations?: string[];
    search_results?: { url?: string }[];
  };
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    citations:
      json.citations ??
      json.search_results?.map((s) => s.url ?? "").filter(Boolean) ??
      [],
  };
}

// ---- Tavily (search + answer) --------------------------------------

export type TavilyResult = {
  answer: string | null;
  results: { title: string; url: string; content: string; score?: number }[];
};

export async function tavilySearch(query: string): Promise<TavilyResult> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY!,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 8,
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    answer?: string;
    results?: { title?: string; url?: string; content?: string; score?: number }[];
  };
  return {
    answer: json.answer ?? null,
    results: (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      score: r.score,
    })),
  };
}

// ---- Parallel (parallel.ai v1beta search) --------------------------

export type ParallelResult = {
  results: { title: string; url: string; excerpts: string[] }[];
};

export async function parallelSearch(
  objective: string,
  searchQueries: string[],
  opts?: { detailed?: boolean; maxResults?: number },
): Promise<ParallelResult> {
  const res = await fetch("https://api.parallel.ai/v1beta/search", {
    method: "POST",
    headers: {
      "x-api-key": env.PARALLEL_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      objective,
      search_queries: searchQueries,
      processor: opts?.detailed ? "pro" : "base",
      max_results: opts?.maxResults ?? 8,
      max_chars_per_result: 6000,
    }),
  });
  if (!res.ok) {
    throw new Error(`Parallel ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    results?: { title?: string; url?: string; excerpts?: string[] }[];
  };
  return {
    results: (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      excerpts: r.excerpts ?? [],
    })),
  };
}

// ---- Exa (neural search + contents, REST) --------------------------

export type ExaResult = {
  results: {
    title: string;
    url: string;
    text: string;
    publishedDate?: string;
    author?: string;
  }[];
};

export async function exaSearch(query: string): Promise<ExaResult> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": env.EXA_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: 8,
      type: "auto",
      contents: { text: { maxCharacters: 2000 } },
    }),
  });
  if (!res.ok) {
    throw new Error(`Exa ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    results?: {
      title?: string;
      url?: string;
      text?: string;
      publishedDate?: string;
      author?: string;
    }[];
  };
  return {
    results: (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      text: r.text ?? "",
      publishedDate: r.publishedDate,
      author: r.author,
    })),
  };
}
