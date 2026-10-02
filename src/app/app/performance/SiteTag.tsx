import { Badge } from "@/components/ui/badge";

/** Display only navigable public website addresses, never arbitrary URL schemes. */
export function SiteTag({ website }: { website?: string | null }) {
  if (!website) return null;
  let url: URL;
  try {
    const value = website.trim();
    url = new URL(value.includes(":") ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return (
    <Badge variant="outline" asChild>
      <a
        href={url.href}
        target="_blank"
        rel="noreferrer"
        title="Open current website"
      >
        {url.hostname} ↗
      </a>
    </Badge>
  );
}
