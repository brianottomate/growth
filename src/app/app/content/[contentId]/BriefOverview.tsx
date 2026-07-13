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
    <section className="bg-card mt-5 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Working brief
        </h2>
        {plannedAt && (
          <span className="text-muted-foreground ml-auto text-xs">
            Planned{" "}
            {plannedAt.toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
      {fields.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          No brief yet. Use the assistant to shape the hook, message, visual,
          and CTA.
        </p>
      ) : (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.label}
              className="bg-background rounded-lg border px-3 py-2.5"
            >
              <dt className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
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
