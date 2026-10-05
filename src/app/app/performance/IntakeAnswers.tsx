import { ExternalLink } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { ButtonLink } from "@/components/ui/button";
import { HomePreview } from "@/components/home-preview";

import { intakeAnswerRows, type IntakeAnswerValue } from "@/lib/intake-answers";

/** A picked home as our own record knows it: name, photo, and its page here. */
export type IntakeHome = {
  name: string;
  thumbUrl: string | null;
  href: string;
  location?: string;
  facts?: string;
};

/**
 * A submitted intake as question and answer. `homes` maps a listing URL,
 * lowercased with no trailing slash, to our record of that home, so a picked
 * home shows as its photo and name rather than its URL.
 */
export function IntakeAnswers({
  answers,
  homes = {},
}: {
  answers: Record<string, unknown>;
  homes?: Record<string, IntakeHome>;
}) {
  return (
    <dl className="divide-y rounded-xl border bg-card text-sm">
      {intakeAnswerRows(answers).map((row) => (
        <div
          key={row.key}
          className="grid gap-1 px-4 py-3 @xl:grid-cols-[200px_minmax(0,1fr)] @xl:gap-4"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0">
            <Answer value={row.value} homes={homes} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Answer({
  value,
  homes,
}: {
  value: IntakeAnswerValue | null;
  homes: Record<string, IntakeHome>;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (value.kind === "yes") return <span>{value.yes ? "Yes" : "No"}</span>;
  if (value.kind === "link") return <LinkAnswer url={value.url} />;
  if (value.kind === "text")
    return (
      <span className="break-words whitespace-pre-wrap">{value.text}</span>
    );
  return <IntakeHomes all={value.all} urls={value.urls} homes={homes} />;
}

/** Past this many, the rest fold behind "Show N more" so the budget stays in view. */
const HOMES_SHOWN = 8;

export function IntakeHomes({
  all,
  urls,
  homes,
}: {
  all: boolean;
  urls: string[];
  homes: Record<string, IntakeHome>;
}) {
  const picked = urls.map((url) => ({
    url,
    home: homes[url.trim().toLowerCase().replace(/\/+$/, "")],
  }));
  const suffix = sharedSuffix(picked.flatMap(({ home }) => home?.name ?? []));
  const grid = (rows: typeof picked) => (
    <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
      {rows.map(({ url, home }) => (
        <li key={url} className="min-w-0">
          {home ? (
            <HomePreview
              href={home.href}
              name={trimSuffix(home.name, suffix)}
              imageUrl={home.thumbUrl}
              location={home.location}
              facts={home.facts}
            />
          ) : (
            <OutLink url={url} />
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-3">
      <p>
        {all
          ? "All of them"
          : `${urls.length} ${urls.length === 1 ? "home" : "homes"}`}
        {all && urls.length > 0 ? ` · ${urls.length} listed` : ""}
      </p>
      {picked.length > 0 && grid(picked.slice(0, HOMES_SHOWN))}
      {picked.length > HOMES_SHOWN && (
        <details className="group space-y-3">
          <summary className="cursor-pointer text-primary group-open:mb-3 hover:underline">
            Show {picked.length - HOMES_SHOWN} more
          </summary>
          {grid(picked.slice(HOMES_SHOWN))}
        </details>
      )}
    </div>
  );
}

/**
 * " - Hocking Hills" on all forty names says nothing forty times. Only a
 * suffix every name shares, after a dash, is dropped.
 */
function sharedSuffix(names: string[]) {
  if (names.length < 2) return "";
  const tail = /\s[-–—|]\s[^-–—|]+$/.exec(names[0]!)?.[0];
  return tail && names.every((name) => name.endsWith(tail)) ? tail : "";
}

function trimSuffix(name: string, suffix: string) {
  return suffix && name.length > suffix.length
    ? name.slice(0, -suffix.length)
    : name;
}

/** One click to open it, and the full URL to read or copy into an email. */
function LinkAnswer({ url }: { url: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          variant="outline"
        >
          Open in {hostLabel(url)}
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </ButtonLink>
        <CopyButton text={url} label="Copy URL" />
      </div>
      <p className="font-mono text-xs break-all text-muted-foreground select-all">
        {url}
      </p>
    </div>
  );
}

/** "Google Drive" reads better than a 90-character share URL. */
function hostLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("drive.google.com") || host.endsWith("docs.google.com"))
      return "Google Drive";
    if (host.endsWith("dropbox.com")) return "Dropbox";
    return host;
  } catch {
    return url;
  }
}

function OutLink({ url, label }: { url: string; label?: string }) {
  // Client-typed: anything but http(s) stays text, never an href.
  if (!/^https?:\/\//i.test(url.trim()))
    return <span className="break-words">{label ?? url}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
    >
      <span className="truncate">{label ?? url}</span>
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
    </a>
  );
}
