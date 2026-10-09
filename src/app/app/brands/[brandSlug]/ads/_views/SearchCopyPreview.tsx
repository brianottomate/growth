import type { AdTextContent } from "@/server/db/ads-schema";

export function SearchCopyPreview({
  copy,
  showExample = true,
  showAssets = true,
}: {
  copy: AdTextContent;
  showExample?: boolean;
  showAssets?: boolean;
}) {
  let hostname = "Website";
  try {
    hostname = new URL(copy.linkUrl ?? "").hostname;
  } catch {
    /* An unfinished draft may have no URL. */
  }
  return (
    <div className="space-y-4">
      {showExample && (
        <div className="max-w-2xl rounded-xl border bg-background p-4">
          <p className="text-xs font-medium">Sponsored · {hostname}</p>
          <p className="mt-2 text-lg leading-snug text-primary">
            {copy.headlines.slice(0, 3).join(" | ")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {copy.descriptions.slice(0, 2).join(" ")}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Example combination · Google chooses which supplied assets to show.
          </p>
        </div>
      )}
      {showAssets && (
        <div className="grid grid-cols-1 items-start gap-4 @xl:grid-cols-2">
          <CopyPool label="Headlines" lines={copy.headlines} limit={30} />
          <CopyPool label="Descriptions" lines={copy.descriptions} limit={90} />
        </div>
      )}
    </div>
  );
}

function CopyPool({
  label,
  lines,
  limit,
}: {
  label: string;
  lines: string[];
  limit: number;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-background">
      <h5 className="border-b px-3 py-2 text-xs font-medium">
        {label} · {lines.length}
      </h5>
      <ul className="divide-y">
        {lines.map((line, index) => (
          <li
            key={index}
            className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
          >
            <span className="min-w-0 break-words">{line}</span>
            {line.length > limit && (
              <span className="shrink-0 pt-0.5 text-xs text-destructive">
                {line.length}/{limit} · Over limit
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
