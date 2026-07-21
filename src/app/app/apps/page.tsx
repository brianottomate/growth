import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import {
  listStorefronts,
  resolveProductOrganizationId,
} from "@/server/services/product-storefront.service";

import { StorefrontOperations } from "./StorefrontOperations";

export default async function AppsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const orgId = await resolveProductOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });
  const storefronts = await listStorefronts({
    orgId,
    userId: session.user.id,
    kind: "human",
  });
  return <StorefrontOperations storefronts={storefronts} />;
}
