import { notFound } from "next/navigation";
import { ContentPostReviewPreview } from "./ContentPostReviewPreview";
export const metadata = { title: "Brand content post · Review prototype" };
export default async function Page({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { brandSlug } = await params;
  return <ContentPostReviewPreview brandSlug={brandSlug} />;
}
