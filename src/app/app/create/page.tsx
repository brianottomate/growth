import { redirect } from "next/navigation";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string; intent?: string }>;
}) {
  const { brandId, intent } = await searchParams;
  const next = new URLSearchParams();
  if (brandId) next.set("brandId", brandId);
  next.set("intent", intent === "analyze" ? "analyze" : "create");
  redirect(`/app/next?${next.toString()}`);
}
