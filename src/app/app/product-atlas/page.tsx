import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import {
  listProducts,
  resolveProductOrganizationId,
} from "@/server/services/product-storefront.service";

import { ProductAtlasIndex } from "./ProductAtlasIndex";

export default async function ProductAtlasPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const orgId = await resolveProductOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });
  const products = await listProducts({
    orgId,
    userId: session.user.id,
    kind: "human",
  });
  return <ProductAtlasIndex products={products} />;
}
