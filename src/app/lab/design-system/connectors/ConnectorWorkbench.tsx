"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Mail,
  ArrowLeft,
  RotateCcw,
  Send,
  Image,
  Sparkles,
  CalendarDays,
  ChartNoAxesCombined,
  Layers,
  ListChecks,
  ArrowUpRight,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { socialFixtures, type ConnectorFixture } from "./fixtures";
import { EmailResultPreview } from "@/app/app/overview/EmailResultPreview";
import { GrowthResultSummary } from "@/app/app/overview/GrowthResultSummary";
import { SocialPostSummary } from "@/app/app/overview/SocialPostSummary";
import { InternalNextOptionsPreview } from "./InternalNextOptionsPreview";

export type ConnectorWidget = {
  id: string;
  title: string;
  description: string;
  schemas: Record<string, string>;
  tool: string;
  uri: string;
  html: string;
  legacy: boolean;
};
type WireMessage = {
  jsonrpc: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
};
type LogEntry = {
  direction: "Widget → host" | "Host → widget";
  message: unknown;
};

function validationMessage(error: unknown) {
  if (!(error instanceof z.ZodError))
    return error instanceof Error ? error.message : "Invalid JSON";
  function issues(
    entries: z.core.$ZodIssue[],
    prefix: PropertyKey[] = [],
  ): string[] {
    return entries.flatMap((issue) => {
      const path = [...prefix, ...issue.path];
      return issue.code === "invalid_union"
        ? issues(issue.errors[0] ?? [], path)
        : [`${path.map(String).join(".") || "Result"}: ${issue.message}`];
    });
  }
  return issues(error.issues).slice(0, 3).join(" · ");
}

function previewDocument(html: string, theme: string, host: string) {
  // Only trusted, server-provided widget HTML runs here. Edited JSON is sent as data.
  // The opaque-origin sandbox and CSP keep the preview away from app sessions.
  const bootstrap = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src about:; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src https://growth-red.vercel.app https://www.wander.com https://assets.wander.com https://assets-websites.wander.com; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>:root{color-scheme:${theme}!important}</style><script>
var waiters={},counter=0;
window.openai={theme:${JSON.stringify(theme)},toolOutput:null};
${host === "openai" ? `window.openai.sendFollowUpMessage=function(args){return new Promise(function(resolve,reject){var id='openai-'+(++counter);waiters[id]={resolve:resolve,reject:reject};window.parent.postMessage({jsonrpc:'2.0',id:id,method:'openai/sendFollowUpMessage',params:args},'*')})};` : ""}
window.addEventListener('message',function(event){if(event.source!==window.parent)return;var m=event.data;if(m&&waiters[m.id]){var w=waiters[m.id];delete waiters[m.id];m.error?w.reject(new Error(m.error.message)):w.resolve()}});
window.addEventListener('message',function(event){if(event.source!==window.parent)return;var m=event.data;if(m&&m.type==='workbench:openai-result'){window.openai.toolOutput=m.payload;window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:window.openai}}))}});
window.addEventListener('DOMContentLoaded',function(){new ResizeObserver(function(){window.parent.postMessage({jsonrpc:'2.0',method:'workbench:size',params:{height:Math.ceil(document.body.getBoundingClientRect().height)}},'*')}).observe(document.body)});
</script>`;
  return html.replace("<head>", `<head>${bootstrap}`);
}

function WidgetPreview({
  widget,
  payload,
  theme,
  host,
  reject,
  loading,
  revision,
}: {
  widget: ConnectorWidget;
  payload: unknown;
  theme: string;
  host: string;
  reject: boolean;
  loading: boolean;
  revision: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const current = useRef({ payload, reject, loading, host });
  const [height, setHeight] = useState(100);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const document = useMemo(
    () => previewDocument(widget.html, theme, host),
    [widget.html, theme, host],
  );
  const record = (direction: LogEntry["direction"], message: unknown) =>
    setLogs((entries) => [...entries.slice(-79), { direction, message }]);
  const send = (message: unknown) => {
    frame.current?.contentWindow?.postMessage(message, "*");
    record("Host → widget", message);
  };
  const deliver = () => {
    if (current.current.loading) return;
    send(
      current.current.host === "openai"
        ? { type: "workbench:openai-result", payload: current.current.payload }
        : {
            jsonrpc: "2.0",
            method: "ui/notifications/tool-result",
            params: { structuredContent: current.current.payload },
          },
    );
  };

  useEffect(() => {
    current.current = { ...current.current, payload, loading, host };
    if (ready.current) deliver();
    // Send a fresh result when the payload or delivery mode changes.
  }, [payload, loading, host, revision]);

  useEffect(() => {
    current.current.reject = reject;
  }, [reject]);

  useEffect(() => {
    function receive(event: MessageEvent<unknown>) {
      if (
        event.source !== frame.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const message = event.data as WireMessage;
      if (message.jsonrpc !== "2.0") return;
      if (
        message.method === "workbench:size" ||
        message.method === "ui/notifications/size-changed"
      ) {
        const reported = message.params?.height;
        if (typeof reported === "number" && Number.isFinite(reported))
          setHeight(Math.min(6000, Math.max(80, reported)));
        if (message.method === "workbench:size") return;
      }
      record("Widget → host", message);
      if (message.method === "ui/initialize") {
        if (current.current.host === "openai") {
          ready.current = true;
          setConnected(true);
          deliver();
          return;
        }
        send({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2026-01-26",
            hostInfo: { name: "Growth workbench", version: "1.0.0" },
            hostCapabilities: { message: {} },
            hostContext: { theme, displayMode: "inline" },
          },
        });
      } else if (message.method === "ui/notifications/initialized") {
        ready.current = true;
        setConnected(true);
        deliver();
      } else if (
        (message.method === "ui/message" ||
          message.method === "openai/sendFollowUpMessage") &&
        message.id !== undefined
      ) {
        if (current.current.reject) {
          send({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32000,
              message: "Simulated host rejection. Try again.",
            },
          });
        } else {
          const content =
            message.method === "openai/sendFollowUpMessage"
              ? [{ text: message.params?.prompt }]
              : message.params?.content;
          const text = Array.isArray(content)
            ? content
                .flatMap((part: unknown) =>
                  part &&
                  typeof part === "object" &&
                  "text" in part &&
                  typeof part.text === "string"
                    ? [part.text]
                    : [],
                )
                .join("\n")
            : "";
          setMessages((entries) => [...entries, text]);
          send({ jsonrpc: "2.0", id: message.id, result: {} });
        }
      } else if (
        message.method === "ui/open-link" &&
        message.id !== undefined
      ) {
        const url = message.params?.url;
        if (typeof url === "string")
          setMessages((entries) => [...entries, `Open in Growth: ${url}`]);
        send({ jsonrpc: "2.0", id: message.id, result: {} });
      } else if (message.id !== undefined && message.method) {
        send({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: "This method is not simulated by the workbench.",
          },
        });
      }
    }
    window.addEventListener("message", receive);
    setMounted(true);
    return () => window.removeEventListener("message", receive);
    // Listener lives for this preview session and reads current controls from a ref.
  }, [theme]);

  return (
    <div className="space-y-6">
      <div
        className="overflow-hidden rounded-2xl border"
        style={{
          background: theme === "dark" ? "#111827" : "#fff",
          color: theme === "dark" ? "#f8fafc" : "#111827",
        }}
      >
        <div className="flex items-center justify-between border-b border-current/10 px-4 py-3 text-xs">
          <span>
            {host === "openai"
              ? "External · ChatGPT · OpenAI globals"
              : "External · ChatGPT / Claude · MCP Apps"}
          </span>
          <span role="status">
            {connected
              ? loading
                ? "Waiting for tool result"
                : "Connected"
              : "Connecting…"}
          </span>
        </div>
        {mounted && (
          <iframe
            ref={frame}
            title={`${widget.title} connector preview`}
            sandbox="allow-scripts allow-forms"
            srcDoc={document}
            className="block w-full border-0"
            style={{ height }}
          />
        )}
      </div>
      <section className="rounded-xl border p-4">
        <h2 className="font-medium">Captured handoffs</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Messages stay in this preview session.
        </p>
        {messages.length ? (
          <ol className="mt-3 space-y-2">
            {messages.map((text, i) => (
              <li
                key={i}
                className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap"
              >
                {text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Use a widget action to inspect its message or navigation handoff.
          </p>
        )}
      </section>
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Host message log</h2>
          <Button size="sm" variant="ghost" onClick={() => setLogs([])}>
            Clear log
          </Button>
        </div>
        <div className="mt-3 max-h-80 space-y-2 overflow-auto">
          {logs.map((entry, i) => (
            <details key={i} className="rounded-lg bg-muted p-2 text-xs">
              <summary className="cursor-pointer">
                {entry.direction} ·{" "}
                {typeof entry.message === "object" &&
                entry.message &&
                "method" in entry.message
                  ? String(entry.message.method)
                  : "Response / result"}
              </summary>
              <pre className="mt-2 overflow-auto break-all whitespace-pre-wrap">
                {JSON.stringify(entry.message, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function InternalSummaryPreview({
  kind,
  payload,
  theme,
  loading,
  reject,
  width,
}: {
  kind: string;
  payload: unknown;
  theme: string;
  loading: boolean;
  reject: boolean;
  width: number;
}) {
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState("");
  return (
    <div
      data-theme={theme}
      className="mx-auto w-full min-w-0 space-y-6 bg-background text-foreground"
      style={{ maxWidth: width }}
    >
      <section className="overflow-hidden rounded-2xl border">
        <div className="flex items-center justify-between border-b px-4 py-3 text-xs">
          <span>Internal · Growth chat</span>
          <span role="status">
            {loading ? "Waiting for tool result" : "Ready"}
          </span>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="text-xs text-muted-foreground">
              Waiting for tool result…
            </p>
          ) : kind === "email" ? (
            <EmailResultPreview result={payload} />
          ) : (
            <GrowthResultSummary kind={kind} result={payload} />
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </section>
      {messages.length > 0 && (
        <section className="rounded-xl border p-4">
          <h2 className="font-medium">Captured follow-ups</h2>
          {messages.map((message, index) => (
            <p key={index} className="mt-2 rounded-lg bg-muted p-3 text-xs">
              {message}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

export function ConnectorWorkbench({
  widgets,
  fixturesByWidget,
}: {
  widgets: ConnectorWidget[];
  fixturesByWidget: Record<string, ConnectorFixture[]>;
}) {
  const [widgetId, setWidgetId] = useState("social");
  const widget = widgets.find((item) => item.id === widgetId) ?? widgets[0]!;
  const fixtures = fixturesByWidget[widgetId] ?? [];
  const [fixtureId, setFixtureId] = useState("comparison");
  const [payload, setPayload] = useState<unknown>(socialFixtures[0]!.payload);
  const [draft, setDraft] = useState(
    JSON.stringify(socialFixtures[0]!.payload, null, 2),
  );
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("light");
  const [width, setWidth] = useState("720");
  const [host, setHost] = useState("mcp");
  const [surface, setSurface] = useState("both");
  const [reject, setReject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(0);
  const [revision, setRevision] = useState(0);
  function loadFixture(id: string, nextFixtures = fixtures) {
    const fixture =
      nextFixtures.find((item) => item.id === id) ?? nextFixtures[0]!;
    setFixtureId(fixture.id);
    setPayload(fixture.payload);
    setDraft(JSON.stringify(fixture.payload, null, 2));
    setError("");
    setSession((value) => value + 1);
  }
  function apply() {
    try {
      const parsed: unknown = JSON.parse(draft);
      const validated = z
        .fromJSONSchema(
          JSON.parse(
            widget.schemas[
              fixtures.find((item) => item.id === fixtureId)?.tool ??
                widget.tool
            ]!,
          ) as z.core.JSONSchema.JSONSchema,
        )
        .parse(parsed);
      setPayload(validated);
      setError("");
      setLoading(false);
      setRevision((value) => value + 1);
    } catch (caught) {
      setError(validationMessage(caught));
    }
  }
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
      <header className="space-y-3">
        <Link
          href="/lab/design-system/connectors/email-review"
          className="block text-sm underline underline-offset-2"
        >
          Client email preview + PDF
        </Link>
        <Link
          href="/app/admin"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Team tools
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Design system / Connectors
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Generative UI, in the conversation.
            </h1>
          </div>
          <Button variant="outline" asChild>
            <Link href="/lab/design-system/chat">Assistant gallery</Link>
          </Button>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {widgets.length} tool results. Compare compact summaries in Growth
          chat and external chat, then inspect the handoff into the website.
        </p>
      </header>
      <section
        aria-label="Widget gallery"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {widgets.map((item) => {
          const Icon =
            {
              workitem: ListChecks,
              campaign: ChartNoAxesCombined,
              creative: Image,
              catalog: Layers,
              brands: Layers,
              photos: Image,
              email: Mail,
              social: Image,
              options: Sparkles,
              calendar: CalendarDays,
              pipeline: Layers,
              production: ListChecks,
              performance: ChartNoAxesCombined,
            }[item.id] ?? Layers;
          const active = widgetId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setWidgetId(item.id);
                setHost("mcp");
                setLoading(false);
                loadFixture(
                  fixturesByWidget[item.id]![0]!.id,
                  fixturesByWidget[item.id],
                );
              }}
              className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/50 ${active ? "border-foreground/30 bg-muted" : "bg-card"}`}
            >
              <span className="rounded-xl border bg-background p-2.5">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                  {item.title}
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </section>
      <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-5 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="font-semibold">Preview controls</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {fixtures.find((item) => item.id === fixtureId)?.tool ??
                widget.tool}
            </p>
          </div>
          <label className="block space-y-2 text-sm">
            <span>Sample result</span>
            <SimpleSelect
              aria-label="Sample result"
              className="w-full"
              value={fixtureId}
              options={fixtures.map((fixture) => ({
                value: fixture.id,
                label: fixture.label,
              }))}
              onValueChange={(id) => loadFixture(id)}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Host bridge</span>
            <SimpleSelect
              aria-label="Host bridge"
              className="w-full"
              value={host}
              options={[
                { value: "mcp", label: "MCP Apps" },
                {
                  value: "openai",
                  label: "OpenAI globals",
                  disabled: !widget.legacy,
                },
              ]}
              onValueChange={(value) => {
                setHost(value);
                setSession((value) => value + 1);
              }}
            />
          </label>
          {!widget.legacy && (
            <p className="text-xs text-muted-foreground">
              This widget currently implements the MCP Apps bridge only.
            </p>
          )}
          <label className="block space-y-2 text-sm">
            <span>Theme</span>
            <SimpleSelect
              aria-label="Theme"
              className="w-full"
              value={theme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onValueChange={setTheme}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Frame width</span>
            <SimpleSelect
              aria-label="Frame width"
              className="w-full"
              value={width}
              options={[
                { value: "360", label: "Phone · 360px" },
                { value: "480", label: "Chat panel · 480px" },
                { value: "720", label: "Wide · 720px" },
              ]}
              onValueChange={setWidth}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={loading}
              onChange={(event) => {
                setLoading(event.target.checked);
                setSession((value) => value + 1);
              }}
            />{" "}
            Hold tool result
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reject}
              onChange={(event) => setReject(event.target.checked)}
            />{" "}
            Reject follow-up messages
          </label>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSession((value) => value + 1)}
          >
            <RotateCcw className="size-4" /> Reset preview
          </Button>
          <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm">
              Resource contract
            </summary>
            <dl className="mt-3 space-y-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Resource URI</dt>
                <dd className="mt-1 font-mono break-all">{widget.uri}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">MIME type</dt>
                <dd className="mt-1 font-mono">text/html;profile=mcp-app</dd>
              </div>
            </dl>
          </details>
        </aside>
        <div className="min-w-0 space-y-6">
          {
            <div
              aria-label="Preview surface"
              className="inline-flex gap-1 rounded-full bg-muted p-1"
            >
              {["internal", "external", "both"].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={surface === value ? "secondary" : "ghost"}
                  className="rounded-full capitalize"
                  aria-pressed={surface === value}
                  onClick={() => setSurface(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          }
          <div className="@container">
            <div
              className={
                surface === "both"
                  ? "grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2"
                  : "grid grid-cols-1"
              }
            >
              {widget.id === "options" && surface !== "external" && (
                <div
                  className="mx-auto w-full min-w-0"
                  style={{ maxWidth: Number(width) }}
                >
                  <InternalNextOptionsPreview
                    key={`internal-${session}-${revision}`}
                    payload={payload}
                    theme={theme}
                    loading={loading}
                    reject={reject}
                  />
                </div>
              )}
              {widget.id === "social" && surface !== "external" && (
                <div
                  data-theme={theme}
                  className="mx-auto w-full min-w-0 overflow-hidden rounded-2xl border bg-background text-foreground"
                  style={{ maxWidth: Number(width) }}
                >
                  <div className="flex items-center justify-between border-b px-4 py-3 text-xs">
                    <span>Internal · Growth chat</span>
                    <span role="status">
                      {loading ? "Waiting for tool result" : "Ready"}
                    </span>
                  </div>
                  <div className="p-4">
                    {loading ? (
                      <p className="text-xs text-muted-foreground">
                        Waiting for tool result…
                      </p>
                    ) : (
                      <SocialPostSummary result={payload} />
                    )}
                  </div>
                </div>
              )}
              {!["options", "social"].includes(widget.id) &&
                surface !== "external" && (
                  <InternalSummaryPreview
                    key={`${widget.id}-${session}-${revision}`}
                    kind={widget.id}
                    payload={payload}
                    theme={theme}
                    loading={loading}
                    reject={reject}
                    width={Number(width)}
                  />
                )}
              {surface !== "internal" && (
                <div
                  className="mx-auto w-full min-w-0"
                  style={{ maxWidth: Number(width) }}
                >
                  <WidgetPreview
                    key={`${widget.id}-${theme}-${host}-${session}`}
                    widget={widget}
                    payload={payload}
                    theme={theme}
                    host={host}
                    reject={reject}
                    loading={loading}
                    revision={revision}
                  />
                </div>
              )}
            </div>
          </div>
          <section className="space-y-3 rounded-2xl border p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">Tool result payload</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Edit structuredContent and replay it into the widget.
                </p>
              </div>
              <Button onClick={apply}>
                <Send className="size-4" /> Apply JSON
              </Button>
            </div>
            <Textarea
              aria-label="Tool result JSON"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-64 font-mono text-xs"
              spellCheck={false}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
