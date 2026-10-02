import type { Metadata } from "next";
import { getEmailDnsConnection } from "@/server/services/email-dns.service";
import { EmailDnsConnection } from "./EmailDnsConnection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Connect your email · Wander",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function EmailDnsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let connection;
  try {
    connection = await getEmailDnsConnection(token);
  } catch {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-semibold">
          Email setup is temporarily unavailable
        </h1>
        <p className="mt-3 text-muted-foreground">
          Please try again shortly or contact your Wander representative.
        </p>
      </main>
    );
  }
  if (!connection)
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-semibold">
          This link is no longer active
        </h1>
        <p className="mt-3 text-muted-foreground">
          Ask your Wander contact for a fresh email connection link.
        </p>
      </main>
    );
  return <EmailDnsConnection token={token} connection={connection} />;
}
