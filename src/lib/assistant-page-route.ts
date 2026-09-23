/** Entity identifiers in the URL. Ownership and display names are resolved server-side. */
export function assistantPageRoute(path: string) {
  const pathname = path.split(/[?#]/)[0]!;
  const brand = /^\/app\/(?:performance\/)?brands\/([^/]+)(?:\/|$)/.exec(
    pathname,
  );
  const campaign =
    /^\/app\/(?:performance\/brands\/[^/]+\/campaigns|brands\/[^/]+\/ads)\/(camp_[^/]+)(?:\/|$)/.exec(
      pathname,
    );
  const platform =
    /^\/app\/(?:performance\/brands\/[^/]+\/campaigns|brands\/[^/]+\/ads)\/platform\/([^/]+)$/.exec(
      pathname,
    );
  const home = /^\/app\/performance\/brands\/[^/]+\/homes\/([^/]+)$/.exec(
    pathname,
  );
  const account = /^\/app\/performance\/(perf_[^/]+)$/.exec(pathname);
  return {
    brandSlug: brand?.[1],
    campaignId: campaign?.[1],
    platformCampaignId: platform?.[1],
    homeId: home?.[1],
    accountId: account?.[1],
  };
}
