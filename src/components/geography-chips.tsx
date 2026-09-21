export function GeographyChips({
  label,
  values,
}: {
  label: string;
  values?: string[];
}) {
  if (!values || values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-[10.5px] text-muted-foreground">{label}</span>
      {[...new Set(values)].map((value) => (
        <span
          key={value}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
        >
          {value}
        </span>
      ))}
    </div>
  );
}
