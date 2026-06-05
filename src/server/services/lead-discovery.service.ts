import {
  isFirecrawlConfigured,
  scrapeForEnrichment,
} from "@/server/clients/firecrawl.client";
import {
  exaSearch,
  isExaConfigured,
  isParallelConfigured,
  isPerplexityConfigured,
  isTavilyConfigured,
  parallelSearch,
  perplexitySearch,
  tavilySearch,
} from "@/server/clients/search-providers.client";

/**
 * Lead discovery — fan out to every configured search/scrape provider for a
 * domain and return the RAW results, fault-tolerant and inspectable. No AI,
 * no DB. This is the input to lead-extraction.service.ts.
 *
 * Callable from tRPC and from scripts (plain args in, plain object out).
 */

export type ProviderResult =
  | { source: ProviderSource; ok: true; ms: number; data: unknown }
  | { source: ProviderSource; ok: false; ms: number; error: string };

export type ProviderSource =
  | "firecrawl"
  | "perplexity"
  | "tavily"
  | "parallel"
  | "exa";

export type DiscoveryResult = {
  domain: string;
  url: string;
  gatheredAt: string;
  durationMs: number;
  providers: ProviderResult[];
  skipped: ProviderSource[]; // providers with no API key configured
};

export type DiscoveryOptions = {
  /** Restrict to a subset of providers (default: all configured). */
  only?: ProviderSource[];
};

/** The research objective reused across the text-search providers. */
function objective(domain: string): string {
  return [
    `Research the property-management / short-term-rental company at the domain "${domain}".`,
    "Find: legal and brand name, how many properties / units they manage,",
    "the cities/markets they operate in, what property management software (PMS)",
    "they use, whether they manage short-term vacation rentals vs long-term,",
    "key people (owners/founders/decision-makers) and contact details, and any",
    "signals about company size or revenue.",
  ].join(" ");
}

export async function discoverDomain(
  domain: string,
  opts: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const url = `https://${domain}`;
  const obj = objective(domain);

  const tasks: {
    source: ProviderSource;
    enabled: boolean;
    run: () => Promise<unknown>;
  }[] = [
    {
      source: "firecrawl",
      enabled: isFirecrawlConfigured,
      run: () => scrapeForEnrichment(url),
    },
    {
      source: "perplexity",
      enabled: isPerplexityConfigured,
      run: () => perplexitySearch(obj),
    },
    {
      source: "tavily",
      // Tavily caps queries at 400 chars — give it a short keyword query, not
      // the full objective (which the other providers tolerate).
      enabled: isTavilyConfigured,
      run: () =>
        tavilySearch(
          `${domain} property management company units managed PMS vacation rental`,
        ),
    },
    {
      source: "parallel",
      enabled: isParallelConfigured,
      run: () =>
        parallelSearch(obj, [
          `${domain} property management company`,
          `${domain} number of units properties managed`,
          `${domain} vacation rental PMS software`,
        ]),
    },
    {
      source: "exa",
      enabled: isExaConfigured,
      run: () => exaSearch(`${domain} property management vacation rental company`),
    },
  ];

  const selected = opts.only
    ? tasks.filter((t) => opts.only!.includes(t.source))
    : tasks;

  const active = selected.filter((t) => t.enabled);
  const skipped = selected.filter((t) => !t.enabled).map((t) => t.source);

  const started = Date.now();
  const providers = await Promise.all(
    active.map(async (t): Promise<ProviderResult> => {
      const t0 = Date.now();
      try {
        const data = await t.run();
        return { source: t.source, ok: true, ms: Date.now() - t0, data };
      } catch (error) {
        return {
          source: t.source,
          ok: false,
          ms: Date.now() - t0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return {
    domain,
    url,
    gatheredAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    providers,
    skipped,
  };
}
