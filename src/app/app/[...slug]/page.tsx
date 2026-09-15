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
      <div className="flex size-12 items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 text-lg font-semibold text-muted-foreground">
        {title.slice(0, 1).toUpperCase()}
      </div>
      <div className="text-lg font-semibold capitalize">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">
        Not built yet — we&apos;re adding screens one at a time. This one&apos;s
        queued.
      </p>
      <Link
        href="/app"
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent/40"
      >
        ← Back to overview
      </Link>
    </div>
  );
}
