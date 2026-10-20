import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@wandercom/design-system-web/ui/container";
import { HomeGroupCollection } from "./HomeGroupCollection";
import { getPublicHomeGroupShare } from "@/server/services/home-group-shares.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: { absolute: "A collection of homes" },
  description: "A handpicked collection of homes, shared with you.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
  openGraph: null,
  twitter: null,
  alternates: null,
};

export default async function HomeGroupSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const collection = await getPublicHomeGroupShare(token);
  if (!collection) notFound();

  return (
    <Container className="py-10 sm:py-16" asChild>
      <main>
        <HomeGroupCollection initial={collection} />
      </main>
    </Container>
  );
}
