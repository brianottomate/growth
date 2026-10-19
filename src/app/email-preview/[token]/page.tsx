import type { Metadata } from "next";
import { loadEmailClientPreview } from "@/server/services/email-client-preview.service";
import { EmailClientReview } from "./EmailClientReview";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Email preview · Wander" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function EmailPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params,
    preview = await loadEmailClientPreview(token);
  if (!preview)
    return (
      <main
        data-theme="light"
        className="grid min-h-screen place-items-center bg-background p-6 text-foreground"
      >
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">
            This preview is no longer available
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Ask your Wander contact for a fresh email preview link.
          </p>
        </div>
      </main>
    );
  return (
    <EmailClientReview
      preview={preview}
      printUrl={`/email-preview/${encodeURIComponent(token)}/print`}
    />
  );
}
