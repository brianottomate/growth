import Link from "next/link";

// Catch-all placeholder for nav items whose screens aren't built yet.
// Real routes (dashboard, account, org, brands/, feed/, …) take precedence
// over this dynamic segment as they get added. Kept dependency-light (only
// next/link) so it can never fail to render.
export default async function PlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const title = (slug?.[0] ?? "page").replace(/-/g, " ");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-16 text-center">
      <div className="border-muted-foreground/30 text-muted-foreground flex size-12 items-center justify-center rounded-xl border border-dashed text-lg font-semibold">
        {title.slice(0, 1).toUpperCase()}
      </div>
      <div className="text-lg font-semibold capitalize">{title}</div>
      <p className="text-muted-foreground max-w-sm text-sm">
        Not built yet — we&apos;re adding screens one at a time. This one&apos;s
        queued.
      </p>
      <Link
        href="/app"
        className="border-border hover:bg-accent/40 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
      >
        ← Back to overview
      </Link>
    </div>
  );
}
