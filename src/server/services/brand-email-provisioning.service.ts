import "server-only";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import {
  brandMarketingDomainSchema,
  suggestedEmailRoot,
} from "@/lib/email-dns";
import { GROWTH_CLIENT_URL } from "@/lib/performance-client-links";
import { db } from "@/server/db";
import { brandTable, type BrandEmailDelivery } from "@/server/db/schema";
import {
  createPostmarkBroadcastStream,
  createPostmarkServer,
  createPostmarkWebhook,
  listPostmarkMessageStreams,
  listPostmarkServers,
  listPostmarkWebhooks,
  postmarkServerToken,
} from "@/server/clients/postmark.client";
import { prepareBrandEmailDns } from "./email-dns.service";

const BROADCAST_STREAM = "broadcast";
const WEBHOOK_URL = `${GROWTH_CLIENT_URL}/api/webhooks/postmark`;

async function findServerByName(name: string) {
  for (let offset = 0; ; offset += 500) {
    const page = await listPostmarkServers(500, offset);
    const match = page.Servers.find((server) => server.Name === name);
    if (match) return match;
    if (offset + 500 >= page.TotalCount) return null;
  }
}

/**
 * Give a client brand its own Postmark server, broadcast stream, Growth
 * webhook and `post.` sending domain, so the intake's Email section has DNS
 * records the first time the client opens it. Each step adopts what already
 * exists, so a re-run fills in only what is missing. Nothing is sent.
 */
export async function provisionBrandEmail(brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) throw new Error("Brand not found.");

  let delivery = brand.emailDelivery;
  if (!delivery) {
    const name = `Performance · ${brand.name}`;
    const server =
      (await findServerByName(name)) ?? (await createPostmarkServer(name));
    const token = await postmarkServerToken(server.ID);

    const { MessageStreams } = await listPostmarkMessageStreams(token);
    if (!MessageStreams.some((stream) => stream.ID === BROADCAST_STREAM))
      await createPostmarkBroadcastStream(token, {
        id: BROADCAST_STREAM,
        name: brand.name,
      });

    const { Webhooks } = await listPostmarkWebhooks(token);
    if (
      !Webhooks.some(
        (hook) =>
          hook.Url === WEBHOOK_URL && hook.MessageStream === BROADCAST_STREAM,
      )
    ) {
      if (!env.POSTMARK_WEBHOOK_SECRET)
        throw new Error("POSTMARK_WEBHOOK_SECRET is not set.");
      await createPostmarkWebhook(token, {
        url: WEBHOOK_URL,
        messageStream: BROADCAST_STREAM,
        headers: [
          {
            Name: "x-growth-postmark-secret",
            Value: env.POSTMARK_WEBHOOK_SECRET,
          },
          { Name: "x-growth-postmark-server", Value: String(server.ID) },
        ],
      });
    }

    delivery = {
      provider: "postmark",
      serverId: server.ID,
      messageStream: BROADCAST_STREAM,
    } satisfies BrandEmailDelivery;
    await db
      .update(brandTable)
      .set({ emailDelivery: delivery })
      .where(eq(brandTable.id, brand.id));
  }

  const existingDomain = brandMarketingDomainSchema.safeParse(
    brand.emailSender?.marketingDomain,
  );
  const rootDomain = suggestedEmailRoot(brand.website);
  const sendingDomain = existingDomain.success
    ? existingDomain.data.sendingDomain
    : rootDomain && brand.organizationId
      ? (
          await prepareBrandEmailDns(
            { brandId: brand.id, rootDomain, subdomain: "post" },
            brand.organizationId,
          )
        ).sendingDomain
      : null;

  return { serverId: delivery.serverId, sendingDomain };
}
