import { notFound, redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import {
  getProduct,
  listProductEditors,
  resolveProductOrganizationId,
} from "@/server/services/product-storefront.service";

import { ProductAtlasWorkspace } from "./ProductAtlasWorkspace";

export default async function ProductAtlasDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const orgId = await resolveProductOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });
  const actor = { orgId, userId: session.user.id, kind: "human" as const };
  const { productId } = await params;
  try {
    const [product, editors] = await Promise.all([
      getProduct(actor, productId),
      listProductEditors(actor),
    ]);
    return <ProductAtlasWorkspace product={product} editors={editors} />;
  } catch {
    notFound();
  }
}
