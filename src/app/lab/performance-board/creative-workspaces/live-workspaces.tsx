"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = "/app/performance/clients/porchlit-properties";
const WORKSPACES = [
  { title: "Catalog", path: `${BASE}/catalog` },
  { title: "Ad Studio", path: `${BASE}/ads` },
  {
    title: "Campaign Ad Studio",
    path: `${BASE}/campaigns/camp_fGW4KbhjFgmH83W7`,
  },
];

function LiveFrame({
  title,
  path,
  width,
  revision,
}: {
  title: string;
  path: string;
  width: number;
  revision: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 500, height: 800 });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, size.width / width);
  return (
    <section
      className="flex min-h-0 min-w-[440px] flex-1 flex-col border-r last:border-r-0"
      aria-label={title}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon-sm" asChild>
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${title}`}
          >
            <ExternalLink className="size-4" />
          </a>
        </Button>
      </header>
      <div ref={container} className="min-h-0 flex-1 overflow-hidden">
        <iframe
          key={revision}
          title={title}
          src={path}
          className="origin-top-left border-0"
          style={{
            width,
            height: size.height / scale,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </section>
  );
}

export function LiveWorkspaces() {
  const [width, setWidth] = useState(1000);
  const [revision, setRevision] = useState(0);
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b px-4 py-3">
        <div className="mr-auto">
          <Link
            href="/lab/performance-board"
            className="text-xs text-muted-foreground"
          >
            Performance vision board
          </Link>
          <h1 className="font-semibold">Creative workspaces</h1>
          <p className="text-xs text-muted-foreground">
            Porchlit Properties · Live pages and data
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Page width
          <select
            aria-label="Page width"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
            className="rounded-md border bg-background px-3 py-2"
          >
            <option value={760}>760px</option>
            <option value={1000}>1000px</option>
            <option value={1280}>1280px</option>
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRevision((value) => value + 1)}
        >
          <RotateCcw className="size-3.5" />
          Reload pages
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {WORKSPACES.map((workspace) => (
          <LiveFrame
            key={workspace.path}
            {...workspace}
            width={width}
            revision={revision}
          />
        ))}
      </div>
    </main>
  );
}
