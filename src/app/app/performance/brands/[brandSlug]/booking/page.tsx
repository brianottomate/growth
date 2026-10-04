import { redirect } from "next/navigation";
export default async function BookingRedirect({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  redirect(`/app/performance/brands/${brandSlug}/wanderos#booking-targets`);
}
