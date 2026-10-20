"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import type { ConnectorFixture } from "../fixtures";
import {
  InternalPreview,
  WidgetPreview,
  type ConnectorWidget,
} from "../ConnectorWorkbench";

/** Short fingerprint so an edited widget document remounts its frame. */
function fingerprint(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++)
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return hash.toString(36);
}

/** Every widget and sample on one scrollable page, each with a stable anchor. */
export function ConnectorSheet({
  widgets,
  fixturesByWidget,
}: {
  widgets: ConnectorWidget[];
  fixturesByWidget: Record<string, ConnectorFixture[]>;
}) {
  const [theme, setTheme] = useState("light");
  const [width, setWidth] = useState("480");
  const [surface, setSurface] = useState("both");
  const [samples, setSamples] = useState("first");
  const frame = Number(width);
  return (
    <main className="mx-auto max-w-7xl space-y-10 p-4 sm:p-8">
      <header className="space-y-3">
        <Link
          href="/lab/design-system/connectors"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Connector workbench
        </Link>
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          Design system / Connectors / All at once
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Every tool result, top to bottom.
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Scroll through and comment. Each section has an anchor, so a link with{" "}
          <code>#brands</code> or <code>#brands-single</code> lands on the
          widget or the exact sample.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <nav aria-label="Widgets" className="flex flex-wrap gap-x-4 gap-y-1">
            {widgets.map((widget) => (
              <a
                key={widget.id}
                href={`#${widget.id}`}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {widget.title}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SimpleSelect
              aria-label="Surface"
              value={surface}
              options={[
                { value: "both", label: "Internal + external" },
                { value: "internal", label: "Internal only" },
                { value: "external", label: "External only" },
              ]}
              onValueChange={setSurface}
            />
            <SimpleSelect
              aria-label="Samples"
              value={samples}
              options={[
                { value: "first", label: "First sample" },
                { value: "all", label: "All samples" },
              ]}
              onValueChange={setSamples}
            />
            <SimpleSelect
              aria-label="Theme"
              value={theme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onValueChange={setTheme}
            />
            <SimpleSelect
              aria-label="Frame width"
              value={width}
              options={[
                { value: "360", label: "360px" },
                { value: "480", label: "480px" },
                { value: "720", label: "720px" },
              ]}
              onValueChange={setWidth}
            />
          </div>
        </div>
      </div>

      {widgets.map((widget) => {
        const fixtures = fixturesByWidget[widget.id] ?? [];
        // Each email sample is a full rendered newsletter; one is enough here.
        const shown =
          samples === "all" && widget.id !== "email"
            ? fixtures
            : fixtures.slice(0, 1);
        const hidden = fixtures.length - shown.length;
        return (
          <section
            key={widget.id}
            id={widget.id}
            aria-labelledby={`${widget.id}-title`}
            className="scroll-mt-24 space-y-6 border-t pt-8"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2
                  id={`${widget.id}-title`}
                  className="group flex items-center gap-2 text-xl font-semibold tracking-tight"
                >
                  <a href={`#${widget.id}`} className="hover:underline">
                    {widget.title}
                  </a>
                  <LinkIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100" />
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {widget.description}
                </p>
              </div>
              <code className="text-xs text-muted-foreground">
                {widget.tool}
              </code>
            </div>
            {hidden > 0 && samples === "all" && (
              <p className="text-xs text-muted-foreground">
                {hidden} more {hidden === 1 ? "sample" : "samples"} in the{" "}
                <Link
                  href="/lab/design-system/connectors"
                  className="underline underline-offset-2"
                >
                  workbench
                </Link>
                .
              </p>
            )}
            {shown.map((fixture) => {
              const anchor = `${widget.id}-${fixture.id}`;
              return (
                <div
                  key={fixture.id}
                  id={anchor}
                  className="scroll-mt-24 space-y-3"
                >
                  <h3 className="group flex items-center gap-2 text-sm font-medium">
                    <a href={`#${anchor}`} className="hover:underline">
                      {fixture.label}
                    </a>
                    {fixture.tool && fixture.tool !== widget.tool && (
                      <code className="text-xs font-normal text-muted-foreground">
                        {fixture.tool}
                      </code>
                    )}
                    <LinkIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100" />
                  </h3>
                  <div className="@container">
                    <div
                      className={
                        surface === "both"
                          ? "grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2"
                          : "grid grid-cols-1"
                      }
                    >
                      {surface !== "external" && (
                        <InternalPreview
                          key={`${anchor}-${theme}`}
                          widget={widget}
                          payload={fixture.payload}
                          theme={theme}
                          loading={false}
                          reject={false}
                          width={frame}
                        />
                      )}
                      {surface !== "internal" && (
                        <div
                          className="mx-auto w-full min-w-0"
                          style={{ maxWidth: frame }}
                        >
                          <WidgetPreview
                            key={`${anchor}-${theme}-${fingerprint(widget.html)}`}
                            widget={widget}
                            payload={fixture.payload}
                            theme={theme}
                            host="mcp"
                            reject={false}
                            loading={false}
                            revision={0}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      <div className="border-t pt-6">
        <Button variant="outline" asChild>
          <a href="#top">Back to top</a>
        </Button>
      </div>
    </main>
  );
}
