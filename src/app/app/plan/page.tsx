import { redirect } from "next/navigation";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { brandId } = await searchParams;
  const next = new URLSearchParams({ intent: "plan" });
  if (brandId) next.set("brandId", brandId);
  redirect(`/app/next?${next.toString()}`);
}
