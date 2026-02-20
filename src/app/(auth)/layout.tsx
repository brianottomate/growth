import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | Wander Growth",
    default: "Wander Growth - Revenue Workflows",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
