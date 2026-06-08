import type { Metadata } from "next";

// Internal tool — keep the auth surfaces out of search. Title template and
// branded defaults are inherited from the root layout (`@/lib/metadata`).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
