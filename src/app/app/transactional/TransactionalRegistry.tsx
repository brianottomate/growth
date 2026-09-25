"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/orpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { TransactionalStatus } from "@/server/db/transactional-schema";
import type { RouterOutputs } from "@/orpc/client";

type RegistryMessage = RouterOutputs["transactional"]["list"][number];

const STATUS_META: Record<
  TransactionalStatus,
  { label: string; cls: string; dot: string }
> = {
  live_legacy: {
    label: "Legacy CIO template",
    cls: "text-amber-300",
    dot: "bg-amber-400",
  },
  live_rebranded: {
    label: "Rebranded (react-email in CIO)",
    cls: "text-sky-300",
    dot: "bg-sky-400",
  },
  live_inhouse: {
    label: "In-house send",
    cls: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  dead: {
    label: "Dead",
    cls: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  retired: {
    label: "Retired",
    cls: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

const DOMAIN_LABEL: Record<string, string> = {
  auth: "Auth",
  booking: "Booking",
  payments: "Payments",
  invoicing: "Invoicing",
  agreements: "Agreements",
  statements: "Statements",
  os_tasks: "OS tasks (vendors)",
  os_notifications: "OS notifications",
  org: "Org & invites",
  other: "Other",
};

const CRITICALITY_LABEL: Record<string, string> = {
  auth_blocking: "Auth-blocking",
  legal_financial: "Legal / financial",
  operational: "Operational",
  informational: "Informational",
};

function triggerSummary(m: RegistryMessage) {
  if (m.triggerKind === "event") return m.triggerEvent ?? "Product event";
  const offset = m.triggerOffsetMinutes;
  const offsetLabel =
    offset != null
      ? `${offset < 0 ? "−" : "+"}${Math.round(Math.abs(offset) / (24 * 60))}d`
      : null;
  const anchor = m.triggerAnchor ? m.triggerAnchor.replaceAll("_", " ") : null;
  const timing =
    m.triggerLabel ??
    (anchor ? `${offsetLabel ?? "around"} ${anchor}` : "time-anchored");
  return `${m.triggerEvent ?? ""} · ${timing}`.replace(/^ · /, "");
}

export function TransactionalRegistry({
  initialMessages,
}: {
  initialMessages: RegistryMessage[];
}) {
  const queryClient = useQueryClient();
  const { data: messages = initialMessages } = useQuery(
    orpc.transactional.list.queryOptions({ initialData: initialMessages }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.transactional.list.queryKey(),
    });
  };
  const updateStatus = useMutation(
    orpc.transactional.updateStatus.mutationOptions({ onSuccess: invalidate }),
  );
  const updateNotes = useMutation(
    orpc.transactional.updateNotes.mutationOptions({ onSuccess: invalidate }),
  );

  const groups = useMemo(() => {
    const byDomain = new Map<string, RegistryMessage[]>();
    for (const m of messages) {
      const list = byDomain.get(m.domain) ?? [];
      list.push(m);
      byDomain.set(m.domain, list);
    }
    return [...byDomain.entries()];
  }, [messages]);

  const showBrand = useMemo(
    () => new Set(messages.map((message) => message.brandId)).size > 1,
    [messages],
  );

  const counts = useMemo(() => {
    const live = messages.filter(
      (m) => m.status !== "dead" && m.status !== "retired",
    );
    return {
      total: live.length,
      legacy: live.filter((m) => m.status === "live_legacy").length,
      codeOwned: live.filter((m) => m.status !== "live_legacy").length,
      matched: live.filter((m) => m.templateKey).length,
      dead: messages.filter((m) => m.status === "dead").length,
    };
  }, [messages]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b pb-4 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{counts.total}</span>{" "}
          live messages
        </span>
        <span>
          <span className="font-medium text-amber-300">{counts.legacy}</span> on
          legacy CIO templates
        </span>
        <span>
          <span className="font-medium text-emerald-300">
            {counts.codeOwned}
          </span>{" "}
          code-owned
        </span>
        <span>
          <span className="font-medium text-foreground">{counts.matched}</span>{" "}
          matched to a design-system template
        </span>
        <span>
          <span className="font-medium text-foreground">{counts.dead}</span>{" "}
          dead env vars
        </span>
      </div>

      {groups.map(([domain, rows]) => (
        <section key={domain} className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            {DOMAIN_LABEL[domain] ?? domain}
            <span className="ml-2 font-normal text-muted-foreground">
              {rows.length}
            </span>
          </h2>
          <div className="mt-2 divide-y rounded-lg border">
            {rows.map((m) => {
              const meta = STATUS_META[m.status];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${meta.dot}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.subject ?? triggerSummary(m)}
                    </span>
                  </span>
                  {showBrand && (
                    <Badge
                      variant="secondary"
                      className="hidden @2xl:inline-flex"
                    >
                      {m.brand.name}
                    </Badge>
                  )}
                  {m.templateKey ? (
                    <Badge
                      variant="outline"
                      className="hidden @2xl:inline-flex"
                    >
                      react-email ready
                    </Badge>
                  ) : m.status !== "dead" ? (
                    <Badge
                      variant="outline"
                      tone="muted"
                      className="hidden @2xl:inline-flex"
                    >
                      template gap
                    </Badge>
                  ) : null}
                  <span className={`shrink-0 text-xs ${meta.cls}`}>
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <MessageSheet
        message={selected}
        onClose={() => setSelectedId(null)}
        onStatusChange={(status) =>
          selected && updateStatus.mutate({ id: selected.id, status })
        }
        onNotesSave={(notes) =>
          selected && updateNotes.mutate({ id: selected.id, notes })
        }
        savingNotes={updateNotes.isPending}
      />
    </div>
  );
}

function MessageSheet({
  message,
  onClose,
  onStatusChange,
  onNotesSave,
  savingNotes,
}: {
  message: RegistryMessage | null;
  onClose: () => void;
  onStatusChange: (status: TransactionalStatus) => void;
  onNotesSave: (notes: string) => void;
  savingNotes: boolean;
}) {
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const { data: preview, isLoading: previewLoading } = useQuery(
    orpc.transactional.preview.queryOptions({
      input: { id: message?.id ?? "" },
      enabled: Boolean(message?.templateKey && message?.previewProps),
    }),
  );

  if (!message) return null;
  const provider = message.providerRef;

  return (
    <Sheet
      open={Boolean(message)}
      onOpenChange={(open) => {
        if (!open) {
          setNotesDraft(null);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{message.name}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {message.brand.name} · {message.key}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          {message.description && (
            <p className="text-sm text-muted-foreground">
              {message.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">Migration status</span>
            <Select
              value={message.status}
              onValueChange={(v) => onStatusChange(v as TransactionalStatus)}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">Workspace</span>
            <span>{message.workspace}</span>
            <span className="text-muted-foreground">Criticality</span>
            <span>{CRITICALITY_LABEL[message.criticality]}</span>
            <span className="text-muted-foreground">Provider</span>
            <span>
              {message.provider}
              {provider?.envVar && (
                <span className="block font-mono text-xs text-muted-foreground">
                  {provider.envVar}
                  {provider.defaultId ? ` (default ${provider.defaultId})` : ""}
                </span>
              )}
            </span>
            {message.linearRef && (
              <>
                <span className="text-muted-foreground">Linear</span>
                <a
                  className="underline underline-offset-2"
                  href={`https://linear.app/wander/issue/${message.linearRef}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {message.linearRef}
                </a>
              </>
            )}
          </div>

          {message.subject && (
            <section>
              <h3 className="text-sm font-semibold">Subject</h3>
              <p className="mt-1 text-sm">{message.subject}</p>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold">Trigger</h3>
            <p className="mt-1 text-sm">{triggerSummary(message)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {message.triggerKind === "event" &&
                "Fires at the moment of the product event."}
              {message.triggerKind === "anchored" &&
                "Owed at an offset from a domain date — timing is an obligation, not a growth lever."}
              {message.triggerKind === "condition" &&
                "Fires while a state persists; the sender re-checks the condition at send time."}
            </p>
          </section>

          {message.codeRefs && message.codeRefs.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Source references</h3>
              <ul className="mt-1 space-y-1">
                {message.codeRefs.map((ref) => (
                  <li key={`${ref.role}:${ref.path}:${ref.line ?? 0}`}>
                    {ref.role && (
                      <Badge
                        variant="outline"
                        textSize="caption"
                        className="mr-2"
                      >
                        {ref.role}
                      </Badge>
                    )}
                    <a
                      className="font-mono text-xs underline underline-offset-2"
                      href={`https://github.com/${ref.repo}/blob/main/${ref.path}${ref.line ? `#L${ref.line}` : ""}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {ref.path}
                      {ref.line ? `:${ref.line}` : ""}
                    </a>
                    {ref.note && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {ref.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {message.dataContract && message.dataContract.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">
                Data contract{" "}
                <span className="font-normal text-muted-foreground">
                  (keys must stay stable across template/provider swaps)
                </span>
              </h3>
              <ul className="mt-1 space-y-0.5">
                {message.dataContract.map((entry) => (
                  <li key={entry.key} className="text-xs">
                    <span className="font-mono">{entry.key}</span>
                    {!entry.required && (
                      <span className="text-muted-foreground"> · optional</span>
                    )}
                    {entry.note && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {entry.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold">Template</h3>
            {message.templateKey ? (
              <p className="mt-1 font-mono text-xs">{message.templateKey}</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                No design-system template matched — build one in
                design-system/packages/emails.
              </p>
            )}
            {message.templateSource === "cio_ui" &&
              message.templateKey &&
              message.status === "live_legacy" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Live HTML is still authored in the Customer.io UI; the key
                  above is the candidate react-email replacement.
                </p>
              )}
          </section>

          {message.templateKey && message.previewProps && (
            <section>
              <h3 className="text-sm font-semibold">
                Preview{" "}
                <span className="font-normal text-muted-foreground">
                  (react-email, placeholder data)
                </span>
              </h3>
              {previewLoading && (
                <p className="mt-1 text-sm text-muted-foreground">Rendering…</p>
              )}
              {preview && !preview.ok && (
                <p className="mt-1 text-sm text-amber-300">{preview.error}</p>
              )}
              {preview?.ok && (
                <iframe
                  title={`${message.key} preview`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="mt-2 h-[480px] w-full rounded-md border bg-background"
                />
              )}
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold">Notes</h3>
            <Textarea
              textSize="sm"
              className="mt-1"
              rows={3}
              value={notesDraft ?? message.notes ?? ""}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Migration notes, gotchas, owner…"
            />
            {notesDraft != null && notesDraft !== (message.notes ?? "") && (
              <Button
                size="sm"
                className="mt-2"
                disabled={savingNotes}
                onClick={() => onNotesSave(notesDraft)}
              >
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
