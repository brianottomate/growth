"use client";

import { Button } from "@/components/ui/button";
import type { AdFormat } from "@/lib/ad-format";

export function AdFormatFilter({
  value,
  onChange,
  formats,
}: {
  value: AdFormat | null;
  onChange: (value: AdFormat | null) => void;
  formats: { id: AdFormat; label: string; count: number }[];
}) {
  return (
    <div role="group" aria-label="Ad types" className="flex flex-wrap gap-1.5">
      <Button
        variant={value === null ? "secondary" : "outline"}
        size="sm"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        All types · {formats.reduce((total, format) => total + format.count, 0)}
      </Button>
      {formats.map((format) => (
        <Button
          key={format.id}
          variant={value === format.id ? "secondary" : "outline"}
          size="sm"
          aria-pressed={value === format.id}
          onClick={() => onChange(format.id)}
        >
          {format.label} · {format.count}
        </Button>
      ))}
    </div>
  );
}
