import { redirect } from "next/navigation";

// listen-v2 was promoted to /app/listen. This redirect must stay: every Slack
// broadcast in #radio-social-listening deep-links /app/listen-v2?tab=….
export default async function ListenV2Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect(tab ? `/app/listen?tab=${encodeURIComponent(tab)}` : "/app/listen");
}
