import type { Metadata } from "next";

import Footer from "./Footer";
import Header from "./Header";

export const metadata: Metadata = {
  title: {
    template: "%s | Wander Growth",
    default: "Wander Growth - Revenue Workflows",
  },
  description: "Growth operations workflows and tooling for the Wander team.",
  openGraph: {
    title: "Wander Growth - Revenue Workflows",
    description: "Growth operations workflows and tooling for the Wander team.",
    siteName: "Wander Growth",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wander Growth - Revenue Workflows",
    description: "Growth operations workflows and tooling for the Wander team.",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background">
      <Header container />
      <main className="isolate">{children}</main>
      <Footer />
    </div>
  );
}
