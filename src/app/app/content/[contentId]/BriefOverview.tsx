type Brief = {
  hook: string | null;
  captionDirection: string | null;
  visualDirection: string | null;
  ctaText: string | null;
  ctaKeyword: string | null;
  kpi: string | null;
};

export function BriefOverview({
  brief,
  plannedAt,
}: {
  brief: Brief;
  plannedAt: Date | null;
}) {
  const fields = [
    { label: "Hook", value: brief.hook },
    { label: "Caption direction", value: brief.captionDirection },
    { label: "Visual direction", value: brief.visualDirection },
    { label: "CTA", value: brief.ctaText },
    { label: "Trigger keyword", value: brief.ctaKeyword },
    { label: "Primary KPI", value: brief.kpi },
  ].filter((field) => field.value?.trim());

  return (
    <section className="mt-5 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Working brief
        </h2>
        {plannedAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            Planned{" "}
            {plannedAt.toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
      {fields.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No brief yet. Use the assistant to shape the hook, message, visual,
          and CTA.
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-3 @xl:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.label}
              className="rounded-lg border bg-background px-3 py-2.5"
            >
              <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                {field.label}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
