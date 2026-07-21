import { notFound, redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import {
  getProduct,
  getStorefront,
  listProductBrandAssets,
  listProductEditors,
  resolveProductOrganizationId,
} from "@/server/services/product-storefront.service";

import { StorefrontEditor } from "./StorefrontEditor";

export default async function StorefrontDetailPage({
  params,
}: {
  params: Promise<{ storefrontId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const orgId = await resolveProductOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });
  const actor = { orgId, userId: session.user.id, kind: "human" as const };
  const { storefrontId } = await params;
  try {
    const storefront = await getStorefront(actor, storefrontId);
    const [product, editors, assets] = await Promise.all([
      getProduct(actor, storefront.productId),
      listProductEditors(actor),
      listProductBrandAssets(actor, storefront.product.brandId),
    ]);
    return (
      <StorefrontEditor
        storefront={storefront}
        editors={editors}
        assets={assets}
        siblings={product.storefronts.filter(
          (item) => item.id !== storefront.id,
        )}
      />
    );
  } catch {
    notFound();
  }
}
