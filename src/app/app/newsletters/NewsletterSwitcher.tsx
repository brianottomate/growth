"use client";

import { useRouter } from "next/navigation";

export function NewsletterSwitcher({
  newsletters,
  selectedId,
  basePath,
}: {
  newsletters: { id: string; name: string }[];
  selectedId: string;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Newsletter"
      className="max-w-full rounded-md border bg-background px-2 py-1 text-sm"
      value={selectedId}
      onChange={(event) =>
        router.replace(
          `${basePath}?tab=newsletters&series=${encodeURIComponent(event.target.value)}`,
          { scroll: false },
        )
      }
    >
      {newsletters.map((newsletter) => (
        <option key={newsletter.id} value={newsletter.id}>
          {newsletter.name}
        </option>
      ))}
    </select>
  );
}
