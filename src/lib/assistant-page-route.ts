/** Entity identifiers in the URL. Ownership and display names are resolved server-side. */
export function assistantPageRoute(path: string) {
  const pathname = path.split(/[?#]/)[0]!;
  const brand =
    /^\/app\/(?:performance\/(?:clients|brands)|brands)\/([^/]+)(?:\/|$)/.exec(
      pathname,
    );
  const campaign =
    /^\/app\/(?:performance\/(?:clients|brands)\/[^/]+\/campaigns|brands\/[^/]+\/ads)\/(camp_[^/]+)(?:\/|$)/.exec(
      pathname,
    );
  const platform =
    /^\/app\/(?:performance\/(?:clients|brands)\/[^/]+\/campaigns|brands\/[^/]+\/ads)\/platform\/([^/]+)$/.exec(
      pathname,
    );
  const home =
    /^\/app\/performance\/(?:clients|brands)\/[^/]+\/homes\/([^/]+)$/.exec(
      pathname,
    );
  const account = /^\/app\/performance\/(perf_[^/]+)$/.exec(pathname);
  const sequence =
    /^\/app\/performance\/(?:clients|brands)\/[^/]+\/newsletters$/.test(
      pathname,
    )
      ? new URLSearchParams(path.split("?")[1]?.split("#")[0]).get("sequence")
      : null;
  return {
    emailSequenceId: sequence && sequence !== "new" ? sequence : undefined,
    initiativeId: /^\/app\/initiatives\/([^/]+)$/.exec(pathname)?.[1],
    brandSlug: brand?.[1],
    campaignId: campaign?.[1],
    platformCampaignId: platform?.[1],
    homeId: home?.[1],
    accountId: account?.[1],
  };
}
