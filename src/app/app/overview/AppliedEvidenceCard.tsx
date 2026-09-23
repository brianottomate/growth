"use client";
import type { AppliedEvidence } from "@/lib/applied-evidence";

export function AppliedEvidenceCard({ evidence, applied }: AppliedEvidence) {
  return (
    <details className="rounded-lg border bg-muted/40 p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        Saved {applied.length} field{applied.length === 1 ? "" : "s"}. View
        changes and sources
      </summary>
      <ul className="mt-3 space-y-2">
        {evidence.map((source, index) => (
          <li key={index}>
            {source.method.replaceAll("-", " ")}:{" "}
            {source.sourceUrl && /^https?:\/\//.test(source.sourceUrl) ? (
              <a
                className="break-all text-primary underline"
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.sourceUrl}
              </a>
            ) : (
              source.sourceId
            )}
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-3">
        {applied.map((change, index) => (
          <div key={index}>
            <dt className="font-medium">
              {change.targetType}: {change.field}
            </dt>
            <dd className="mt-1 max-h-48 overflow-auto break-words whitespace-pre-wrap text-muted-foreground">
              {typeof change.value === "string"
                ? change.value
                : JSON.stringify(change.value, null, 2)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
