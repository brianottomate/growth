import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { isOptedOut, readUnsubscribeToken } from "@/server/email/unsubscribe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Unsubscribe" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The footer link in a brand's marketing email. No login: the signed token
 * is the credential. The guest sees the brand they subscribed to, never
 * Wander's. A button, not the page load, unsubscribes.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const target = readUnsubscribeToken(token);
  const brand = target
    ? await db.query.brandTable.findFirst({
        where: eq(brandTable.id, target.brandId),
        columns: { name: true, emailSender: true },
      })
    : null;
  const done =
    target && brand ? await isOptedOut(target.brandId, target.email) : false;
  const name = brand?.emailSender?.fromName || brand?.name;
  const logo = brand?.emailSender?.logoUrl;
  return (
    <main
      data-theme="light"
      className="grid min-h-screen place-items-center bg-surface-primary px-6 text-primary"
    >
      <div className="w-full max-w-sm text-center">
        {logo && (
          // oxlint-disable-next-line next/no-img-element -- brand logo from its own site
          <img
            src={logo}
            alt={name ?? ""}
            className="mx-auto mb-6 h-12 w-auto"
          />
        )}
        {!target || !brand ? (
          <>
            <h1 className="text-xl font-semibold">This link is not valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use the unsubscribe link in the most recent email you received.
            </p>
          </>
        ) : done ? (
          <>
            <h1 className="text-xl font-semibold">You’re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {target.email} will no longer receive marketing email from {name}.
              Emails about your bookings still arrive as usual.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Unsubscribe from {name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Stop marketing email to {target.email}. Emails about your bookings
              still arrive as usual.
            </p>
            <form method="post" action={`/api/email/unsubscribe/${token}`}>
              <button
                type="submit"
                className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Unsubscribe
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
