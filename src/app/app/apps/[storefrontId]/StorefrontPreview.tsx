import type {
  StorefrontContent,
  StorefrontListingStatus,
  StorefrontSurfaceId,
} from "@/lib/product-atlas";

type PreviewAsset = {
  id: string;
  title: string | null;
  alt: string | null;
  url: string | null;
  thumbnailUrl: string | null;
};

export function StorefrontPreview({
  content,
  surface,
  listingStatus,
  assets,
}: {
  content: StorefrontContent;
  surface: StorefrontSurfaceId;
  listingStatus: StorefrontListingStatus;
  assets: PreviewAsset[];
}) {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const icon = content.iconMediaAssetId
    ? assetById.get(content.iconMediaAssetId)
    : undefined;
  const screenshots = [...content.screenshots]
    .sort((a, b) => a.order - b.order)
    .map((item) => assetById.get(item.mediaAssetId))
    .filter((asset): asset is PreviewAsset => Boolean(asset));

  if (surface === "chatgpt_connector" || surface === "claude_connector") {
    return (
      <AssistantPreview
        content={content}
        icon={icon}
        screenshot={screenshots[0]}
        host={surface === "chatgpt_connector" ? "ChatGPT" : "Claude"}
        listingStatus={listingStatus}
      />
    );
  }

  return (
    <StorePreview
      content={content}
      icon={icon}
      screenshots={screenshots}
      surface={surface}
      listingStatus={listingStatus}
    />
  );
}

function AssistantPreview({
  content,
  icon,
  screenshot,
  host,
  listingStatus,
}: {
  content: StorefrontContent;
  icon?: PreviewAsset;
  screenshot?: PreviewAsset;
  host: "ChatGPT" | "Claude";
  listingStatus: StorefrontListingStatus;
}) {
  const prompts = stringList(content.platformFields.starterPrompts);
  const skills = stringList(
    content.platformFields.proposedSkills ??
      content.platformFields.runtimeCapabilities ??
      content.platformFields.runtimeTools,
  );

  return (
    <section className="overflow-hidden rounded-2xl border bg-[#0b0b0b] text-white shadow-sm">
      <div className="border-b border-white/10 px-6 py-3 text-xs text-white/55">
        Internal {host} directory preview · {listingStatus.replaceAll("_", " ")}
      </div>
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10 @xl:px-10">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <PreviewIcon asset={icon} name={content.copy.displayName} />
            <div>
              <h2 className="text-xl font-semibold">
                {content.copy.displayName || "Untitled app"}
              </h2>
              <p className="mt-1 text-sm text-white/60">
                {content.copy.shortDescription ||
                  content.positioning.valueProposition}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
            {listingStatus === "live" ? "Connected" : "Install"}
          </span>
        </header>

        <div className="relative min-h-64 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-200 via-cyan-300 to-emerald-300 text-black">
          {screenshot?.url || screenshot?.thumbnailUrl ? (
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              src={screenshot.url ?? screenshot.thumbnailUrl ?? ""}
              alt={screenshot.alt ?? screenshot.title ?? "Product preview"}
              className="h-full min-h-64 w-full object-cover"
            />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-7">
              {(prompts.length ? prompts : content.positioning.keyMessages)
                .slice(0, 3)
                .map((prompt) => (
                  <div
                    key={prompt}
                    className="max-w-xl rounded-full bg-white/90 px-4 py-2 text-xs font-medium shadow-sm"
                  >
                    @{content.copy.displayName || "App"} {prompt}
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="space-y-3 text-sm leading-6 text-white/75">
          {paragraphs(content.copy.longDescription).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {skills.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-white/60">Skills</p>
            <div className="flex flex-wrap gap-2">
              {skills.slice(0, 8).map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        <dl className="divide-y divide-white/10 border-y border-white/10 text-xs">
          <PreviewRow label="Developer" value={content.copy.displayName} />
          <PreviewRow label="Category" value={content.positioning.category} />
          <PreviewRow label="Tagline" value={content.copy.tagline} />
        </dl>
      </div>
    </section>
  );
}

function StorePreview({
  content,
  icon,
  screenshots,
  surface,
  listingStatus,
}: {
  content: StorefrontContent;
  icon?: PreviewAsset;
  screenshots: PreviewAsset[];
  surface: StorefrontSurfaceId;
  listingStatus: StorefrontListingStatus;
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm @xl:p-8">
      <p className="text-xs text-muted-foreground">
        Internal {surface.replaceAll("_", " ")} preview ·{" "}
        {listingStatus.replaceAll("_", " ")}
      </p>
      <header className="mt-5 flex items-start gap-4">
        <PreviewIcon asset={icon} name={content.copy.displayName} light />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold">
            {content.copy.displayName || "Untitled app"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {content.copy.shortDescription || content.copy.tagline}
          </p>
          <p className="mt-2 text-xs font-medium">
            {content.positioning.category}
          </p>
        </div>
      </header>

      {screenshots.length > 0 && (
        <div className="mt-7 flex snap-x gap-3 overflow-x-auto pb-2">
          {screenshots.map((asset) => (
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              key={asset.id}
              src={asset.url ?? asset.thumbnailUrl ?? ""}
              alt={asset.alt ?? asset.title ?? "Store screenshot"}
              className="max-h-[520px] min-w-64 snap-start rounded-xl border object-cover"
            />
          ))}
        </div>
      )}

      <div className="mt-7 max-w-3xl space-y-3 text-sm leading-6">
        {paragraphs(content.copy.longDescription).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

function PreviewIcon({
  asset,
  name,
  light = false,
}: {
  asset?: PreviewAsset;
  name: string;
  light?: boolean;
}) {
  const source = asset?.url ?? asset?.thumbnailUrl;
  return (
    <div
      className={`grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border text-lg font-semibold ${
        light ? "bg-muted" : "border-white/15 bg-white text-black"
      }`}
    >
      {source ? (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={source}
          alt={asset?.alt ?? name}
          className="size-full object-cover"
        />
      ) : (
        name.slice(0, 1).toUpperCase() || "?"
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-3">
      <dt className="text-white/45">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function paragraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}
