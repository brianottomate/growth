import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadPerformanceBrand } from "../_data";
import { BillingClient } from "./BillingClient";
export const metadata: Metadata = { title: "Billing · Wander Performance" };
export const dynamic = "force-dynamic";
export default async function BillingPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session || !org) redirect("/signin");
  if (!brand) notFound();
  return (
    <BillingClient
      brandId={brand.id}
      accountId={deskBrand?.account?.id ?? null}
    />
  );
}
