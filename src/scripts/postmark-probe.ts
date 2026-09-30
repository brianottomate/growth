// Read-only Postmark probe: servers, streams, a domain's DNS state, and recent
// traffic from it. Every call is a GET.
//   bun --conditions=react-server run src/scripts/postmark-probe.ts [domain]
import {
  dumpPostmarkSuppressions,
  findPostmarkDomain,
  getPostmarkDeliveryStats,
  getPostmarkOutboundStats,
  getPostmarkServer,
  listAllPostmarkDomains,
  listPostmarkMessageStreams,
  listPostmarkSenderSignatures,
  listPostmarkServers,
  listPostmarkWebhooks,
  searchPostmarkOutboundMessages,
} from "@/server/clients/postmark.client";

const domainName = process.argv[2] ?? "winterparkescapes.com";

async function attempt<T>(label: string, run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    console.log(`  ✗ ${label}: ${(error as Error).message.slice(0, 200)}`);
    return null;
  }
}

console.log("== Account");
const servers = await attempt("servers", () => listPostmarkServers());
for (const server of servers?.Servers ?? []) {
  console.log(
    `  server ${server.ID} "${server.Name}" ${server.DeliveryType} opens=${server.TrackOpens} links=${server.TrackLinks}`,
  );
}
const domains = await attempt("domains", () => listAllPostmarkDomains());
if (domains) {
  const verified = domains.filter(
    (d) => d.DKIMVerified && d.ReturnPathDomainVerified,
  ).length;
  console.log(
    `  domains: ${domains.length} (${verified} DKIM+return-path ever verified)`,
  );
}
const signatures = await attempt("sender signatures", () =>
  listPostmarkSenderSignatures(),
);
if (signatures) console.log(`  sender signatures: ${signatures.TotalCount}`);

console.log("\n== Server behind POSTMARK_SERVER_TOKEN");
const server = await attempt("server", () => getPostmarkServer());
if (server)
  console.log(`  ${server.ID} "${server.Name}" ${server.DeliveryType}`);
const streams = await attempt("streams", () => listPostmarkMessageStreams());
for (const stream of streams?.MessageStreams ?? []) {
  console.log(
    `  stream ${stream.ID} (${stream.MessageStreamType}) "${stream.Name}" unsubscribe=${stream.SubscriptionManagementConfiguration.UnsubscribeHandlingType}`,
  );
}
const webhooks = await attempt("webhooks", () => listPostmarkWebhooks());
for (const hook of webhooks?.Webhooks ?? []) {
  const on = Object.entries(hook.Triggers)
    .filter(([, t]) => t.Enabled)
    .map(([name]) => name);
  console.log(
    `  webhook ${hook.ID} [${hook.MessageStream}] ${hook.Url} → ${on.join(",")}`,
  );
}
const delivery = await attempt("delivery stats", () =>
  getPostmarkDeliveryStats(),
);
if (delivery) {
  console.log(
    `  inactive (suppressed) addresses: ${delivery.InactiveMails}; bounces: ${delivery.Bounces.map((b) => `${b.Name}=${b.Count}`).join(", ")}`,
  );
}
const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const stats = await attempt("outbound stats", () =>
  getPostmarkOutboundStats({ fromdate: since }),
);
if (stats) console.log(`  last 30d: ${JSON.stringify(stats)}`);

console.log(`\n== ${domainName}`);
const domain = await attempt("domain", () => findPostmarkDomain(domainName));
if (!domain) {
  console.log("  not on this Postmark account");
} else {
  console.log(`  id ${domain.ID}`);
  console.log(
    `  DKIM live=${domain.DKIMUpdateStatus} ever=${domain.DKIMVerified} weak=${domain.WeakDKIM}`,
  );
  console.log(`  DKIM host ${domain.DKIMHost || domain.DKIMPendingHost}`);
  console.log(
    `  return-path ${domain.ReturnPathDomain} → ${domain.ReturnPathDomainCNAMEValue} verified=${domain.ReturnPathDomainVerified}`,
  );
  if (domain.DKIMPendingHost && domain.DKIMHost) {
    console.log(`  ⚠ rotation pending: ${domain.DKIMPendingHost}`);
  }
}

const from = `contact@${domainName}`;
const sent = await attempt("outbound messages", () =>
  searchPostmarkOutboundMessages({ fromemail: from, count: 10 }),
);
if (sent) {
  console.log(`  messages from ${from} (retention window): ${sent.TotalCount}`);
  for (const message of sent.Messages) {
    console.log(
      `    ${message.ReceivedAt.slice(0, 16)} [${message.MessageStream}] ${message.Status} "${message.Subject}" tag=${message.Tag || "-"}`,
    );
  }
}

for (const stream of streams?.MessageStreams ?? []) {
  if (stream.MessageStreamType === "Inbound") continue;
  const dump = await attempt(`suppressions ${stream.ID}`, () =>
    dumpPostmarkSuppressions(stream.ID),
  );
  if (!dump) continue;
  const byReason = new Map<string, number>();
  for (const row of dump.Suppressions) {
    byReason.set(
      row.SuppressionReason,
      (byReason.get(row.SuppressionReason) ?? 0) + 1,
    );
  }
  const reasons = [...byReason].map(([reason, n]) => `${reason}=${n}`);
  console.log(
    `  suppressions on ${stream.ID}: ${dump.Suppressions.length} (${reasons.join(", ")})`,
  );
}
