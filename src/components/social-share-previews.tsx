type SocialSharePreviewsProps = {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImage?: string | null;
};

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function PreviewImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className: string;
}) {
  return src ? (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={src}
      alt={alt}
      className={`bg-gray-100 object-cover ${className}`}
    />
  ) : (
    <div
      className={`flex items-center justify-center bg-gray-100 text-[10px] text-gray-400 ${className}`}
    >
      No OG image
    </div>
  );
}

export function SocialSharePreviews({
  url,
  title,
  description,
  image,
  twitterTitle,
  twitterDescription,
  twitterImage,
}: SocialSharePreviewsProps) {
  const domain = domainOf(url);
  const xTitle = twitterTitle ?? title;
  const xDescription = twitterDescription ?? description;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Provider label="Facebook / WhatsApp">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
          <PreviewImage
            src={image}
            alt="Facebook link preview"
            className="aspect-[1.91/1] w-full"
          />
          <div className="space-y-1 bg-[#f0f2f5] px-3 py-2.5">
            <div className="text-[10px] text-gray-500 uppercase">{domain}</div>
            <div className="line-clamp-2 text-xs font-semibold text-[#1d2129]">
              {title}
            </div>
            <div className="line-clamp-1 text-[11px] text-gray-500">
              {description ?? "—"}
            </div>
          </div>
        </div>
      </Provider>

      <Provider label="LinkedIn">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
          <PreviewImage
            src={image}
            alt="LinkedIn link preview"
            className="aspect-[1.91/1] w-full"
          />
          <div className="border-t border-gray-200 px-3 py-2.5">
            <div className="line-clamp-2 text-xs font-semibold text-[#000000e6]">
              {title}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">{domain}</div>
          </div>
        </div>
      </Provider>

      <Provider label="X large card">
        <div className="overflow-hidden rounded-2xl border border-gray-700 bg-black shadow-sm">
          <PreviewImage
            src={twitterImage ?? image}
            alt="X link preview"
            className="aspect-[2/1] w-full"
          />
          <div className="px-3 py-2.5">
            <div className="line-clamp-1 text-xs font-medium text-white">
              {xTitle}
            </div>
            <div className="mt-1 line-clamp-1 text-[10px] text-gray-500">
              {xDescription ?? domain}
            </div>
          </div>
        </div>
      </Provider>

      <Provider label="Instagram DM">
        <div className="mx-auto max-w-[240px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:mx-0">
          <PreviewImage
            src={image}
            alt="Instagram direct-message preview"
            className="aspect-square w-full"
          />
          <div className="px-3 py-2">
            <div className="line-clamp-1 text-xs font-semibold text-gray-900">
              {title}
            </div>
            <div className="mt-1 text-[10px] text-gray-400">{domain}</div>
          </div>
        </div>
      </Provider>
    </div>
  );
}

function Provider({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}
