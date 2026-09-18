"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";
import {
  CHECKLIST_SECTIONS,
  checklistProgress,
  STATUS_LABEL,
  type ChecklistField,
  type ChecklistItemMeta,
  type ChecklistValue,
  type PerformanceChecklist,
} from "@/lib/performance-checklist";

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const s = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function PerformanceChecklistForm({
  brandId,
  initial,
  links,
}: {
  brandId: string;
  initial: PerformanceChecklist | null;
  /** Auto-populated per-brand links: the intake form, pitch page, and the Leadsie access grant. */
  links: {
    intake: string | null;
    pitch: string | null;
    leadsie: string | null;
  };
}) {
  const trpc = useTRPC();
  const [values, setValues] = useState<Record<string, ChecklistValue>>(
    initial?.values ?? {},
  );
  const [meta, setMeta] = useState<Record<string, ChecklistItemMeta>>(
    initial?.meta ?? {},
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const save = useMutation(
    trpc.brand.setPerformanceChecklist.mutationOptions({
      onSuccess: (res: PerformanceChecklist) => {
        setValues(res.values ?? {});
        setMeta(res.meta ?? {});
        setDirty(new Set());
        toast.success("Checklist saved");
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  const set = (key: string, value: ChecklistValue) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const onSave = () => {
    if (dirty.size === 0) return;
    const patch: Record<string, ChecklistValue> = {};
    for (const key of dirty) patch[key] = values[key] ?? null;
    save.mutate({ id: brandId, patch });
  };

  const progress = useMemo(() => checklistProgress({ values }), [values]);
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/60"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress.done}/{progress.total} done
        </span>
        <Button
          size="sm"
          shape="round"
          density="editorial"
          disabled={dirty.size === 0 || save.isPending}
          onClick={onSave}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <section className="space-y-1">
        <p className="text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          Links
        </p>
        <div className="overflow-hidden rounded-xl border bg-card">
          <LinkRow label="Intake form" url={links.intake} first />
          <LinkRow label="Pitch page" url={links.pitch} />
          <LinkRow label="Access grant (Leadsie)" url={links.leadsie} />
        </div>
      </section>

      {CHECKLIST_SECTIONS.map((section) => (
        <section key={section.title} className="space-y-1">
          <p className="text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
            {section.title}
          </p>
          <div className="overflow-hidden rounded-xl border bg-card">
            {section.fields.map((field, i) => (
              <Row
                key={field.key}
                field={field}
                value={values[field.key] ?? null}
                meta={meta[field.key]}
                onChange={(v) => set(field.key, v)}
                first={i === 0}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  field,
  value,
  meta,
  onChange,
  first,
}: {
  field: ChecklistField;
  value: ChecklistValue;
  meta: ChecklistItemMeta | undefined;
  onChange: (value: ChecklistValue) => void;
  first: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 ${first ? "" : "border-t"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{field.label}</p>
        {meta ? (
          <p className="text-[11px] text-muted-foreground">
            {meta.byName ?? "someone"} · {relative(meta.at)}
          </p>
        ) : null}
      </div>
      <Field field={field} value={value} onChange={onChange} />
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ChecklistField;
  value: ChecklistValue;
  onChange: (value: ChecklistValue) => void;
}) {
  const input =
    "h-8 rounded-lg border bg-muted/40 px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  if (field.kind === "status") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${input} w-36`}
      >
        <option value="">—</option>
        <option value="yes">{STATUS_LABEL.yes}</option>
        <option value="in_progress">{STATUS_LABEL.in_progress}</option>
        <option value="no">{STATUS_LABEL.no}</option>
      </select>
    );
  }

  if (field.kind === "money" || field.kind === "number") {
    return (
      <div className="flex items-center gap-1">
        {field.kind === "money" ? (
          <span className="text-sm text-muted-foreground">$</span>
        ) : null}
        <input
          type="number"
          inputMode="decimal"
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          className={`${input} w-28 text-right tabular-nums`}
        />
      </div>
    );
  }

  return (
    <input
      type={field.kind === "date" ? "date" : "text"}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${input} w-56`}
    />
  );
}

function LinkRow({
  label,
  url,
  first,
}: {
  label: string;
  url: string | null;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 ${first ? "" : "border-t"}`}
    >
      <p className="w-44 shrink-0 text-sm">{label}</p>
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground hover:text-foreground hover:underline"
          >
            {url.replace(/^https?:\/\//, "")}
          </a>
          <button
            type="button"
            title="Copy"
            aria-label="Copy"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success("Copied");
            }}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-3.5" />
          </button>
        </>
      ) : (
        <span className="flex-1 text-[12px] text-muted-foreground">
          Needs a brand slug
        </span>
      )}
    </div>
  );
}
