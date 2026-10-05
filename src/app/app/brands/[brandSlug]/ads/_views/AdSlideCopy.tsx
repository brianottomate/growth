/** Shared caption for compact and expanded carousel previews. */
export function AdSlideCopy({
  headline,
  description,
}: {
  headline?: string | null;
  description?: string | null;
}) {
  return (
    <div className="rounded-b-lg border border-t-0 bg-card px-2.5 py-2 text-xs">
      <p
        className={`truncate font-medium ${headline ? "" : "text-muted-foreground"}`}
        title={headline || undefined}
      >
        {headline || "Headline not set"}
      </p>
      <p className="line-clamp-2 text-muted-foreground">
        {description || "Description not set"}
      </p>
    </div>
  );
}
