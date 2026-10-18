"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc, type RouterOutputs } from "@/orpc/client";
import type { WorkbookDocument, WorkbookRow } from "@/lib/content-workbook";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
type Book = RouterOutputs["contentWorkbook"]["get"];
export function WorkbookReview({ id }: { id: string }) {
  const q = useQuery(orpc.contentWorkbook.get.queryOptions({ input: { id } }));
  if (q.error)
    return (
      <p className="p-6" role="alert">
        {q.error.message}
      </p>
    );
  if (!q.data) return <p className="p-6">Loading workbook…</p>;
  return <Editor key={`${q.data.id}:${q.data.updatedAt}`} book={q.data} />;
}
function Editor({ book }: { book: Book }) {
  const [document, setDocument] = useState<WorkbookDocument>(book.document);
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const options = useQuery(
    orpc.contentWorkbook.options.queryOptions({
      input: { brandId: book.brandId },
    }),
  );
  async function refreshed() {
    await client.invalidateQueries({ queryKey: orpc.contentWorkbook.key() });
    await client.invalidateQueries({ queryKey: orpc.content.key() });
  }
  const save = useMutation(
    orpc.contentWorkbook.save.mutationOptions({
      onSuccess: async () => {
        await refreshed();
        toast.success("Workbook saved");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const apply = useMutation(
    orpc.contentWorkbook.apply.mutationOptions({
      onSuccess: async () => {
        await refreshed();
        toast.success("Workbook applied to content drafts");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const dirty = JSON.stringify(document) !== JSON.stringify(book.document);
  const locked = !!book.appliedAt || save.isPending || apply.isPending;
  function update(index: number, patch: Partial<WorkbookRow>) {
    setDocument((d) => ({
      ...d,
      rows: d.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }
  function choice(
    index: number,
    key: "seriesId" | "ownerId" | "slotId" | "platform" | "format",
    label: string,
    items: { value: string; label: string }[],
  ) {
    const value = document.rows[index]![key];
    return (
      <label className="space-y-1 text-sm">
        {label}
        <SimpleSelect
          aria-label={`${label} row ${document.rows[index]!.sourceRow}`}
          disabled={locked}
          value={value || "__none"}
          onValueChange={(v) =>
            update(index, {
              [key]: v === "__none" ? "" : v,
              ...(key === "platform"
                ? {
                    format:
                      options.data?.formats.find((f) => f.platform === v)?.id ??
                      "",
                  }
                : {}),
            })
          }
          options={[
            { value: "__none", label: "None" },
            ...items,
            ...(value && !items.some((i) => i.value === value)
              ? [{ value, label: `Resolve: ${value}` }]
              : []),
          ]}
        />
      </label>
    );
  }
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <Link className="text-sm underline" href="/app/content/workbooks">
        Workbooks
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{book.name}</h1>
        <p className="mt-2 text-muted-foreground">
          {book.appliedAt
            ? "Applied. Open each content draft to continue editing."
            : "Review captions, grouping and dates. Applying creates editable local drafts."}
        </p>
      </header>
      {book.appliedAt ? (
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="font-semibold">Created content</h2>
          {[...new Set(book.results.map((r) => r.contentPostId))].map(
            (id, i) =>
              id ? (
                <Link
                  className="block text-sm underline"
                  href={`/app/content/${id}`}
                  key={id}
                >
                  {book.document.rows.find((r) =>
                    book.results.some(
                      (result) =>
                        result.sourceRow === r.sourceRow &&
                        result.contentPostId === id,
                    ),
                  )?.title ?? id}
                </Link>
              ) : (
                <p key={`removed-${i}`} className="text-sm">
                  A resulting draft was deleted.
                </p>
              ),
          )}
        </section>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={locked || !dirty}
            onClick={() => save.mutate({ id: book.id, document })}
          >
            Save review
          </Button>
          <Button
            disabled={locked || dirty || book.issues.length > 0}
            onClick={() =>
              apply.mutate({ id: book.id, reviewed: book.document })
            }
          >
            {apply.isPending
              ? "Applying…"
              : `Apply ${document.rows.filter((r) => r.include).length} selected rows`}
          </Button>
          {dirty && (
            <p className="self-center text-sm text-muted-foreground">
              Save to refresh the review checks.
            </p>
          )}
        </div>
      )}
      {!book.appliedAt && book.issues.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Resolve before applying</h2>
          <ul className="list-disc pl-5 text-sm">
            {book.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
      {book.warnings.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary>Import notes</summary>
          <ul className="list-disc pl-5 text-sm">
            {book.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <label className="block space-y-1 text-sm">
        Initiative
        <SimpleSelect
          aria-label="Initiative"
          disabled={locked}
          value={document.initiativeId || "__none"}
          onValueChange={(v) =>
            setDocument((d) => ({
              ...d,
              initiativeId: v === "__none" ? "" : v,
            }))
          }
          options={[
            { value: "__none", label: "No initiative" },
            ...(options.data?.initiatives ?? []).map((i) => ({
              value: i.id,
              label: i.name,
            })),
          ]}
        />
      </label>
      {options.error && <p role="alert">{options.error.message}</p>}
      <p className="text-sm text-muted-foreground">
        Use the same idea key to combine platform rows. Shared fields must
        match. Dates place drafts at noon UTC on the calendar. Choosing a slot
        replaces its empty brief after review.
      </p>
      {document.rows.slice(page * 20, page * 20 + 20).map((row, offset) => {
        const index = page * 20 + offset;
        return (
          <article
            key={row.sourceRow}
            className="space-y-4 rounded-lg border p-5"
          >
            <div className="flex items-center gap-3">
              <Checkbox
                aria-label={`Include row ${row.sourceRow}`}
                checked={row.include}
                disabled={locked}
                onCheckedChange={(v) => update(index, { include: v === true })}
              />
              <h2 className="font-semibold">Row {row.sourceRow}</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(["title", "ideaKey", "date"] as const).map((key) => (
                <label key={key} className="space-y-1 text-sm">
                  {{ title: "Title", ideaKey: "Idea key", date: "Date" }[key]}
                  <Input
                    type={key === "date" ? "date" : "text"}
                    disabled={locked}
                    value={row[key]}
                    onChange={(e) => update(index, { [key]: e.target.value })}
                  />
                </label>
              ))}
              {choice(
                index,
                "platform",
                "Platform",
                [
                  ...new Set(
                    options.data?.formats.map((f) => f.platform) ?? [],
                  ),
                ].map((p) => ({ value: p, label: p })),
              )}
              {choice(
                index,
                "format",
                "Format",
                (options.data?.formats ?? [])
                  .filter((f) => f.platform === row.platform)
                  .map((f) => ({ value: f.id, label: f.label })),
              )}
              {choice(
                index,
                "seriesId",
                "Series",
                (options.data?.series ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                })),
              )}
              {choice(
                index,
                "ownerId",
                "Owner",
                (options.data?.owners ?? []).map((o) => ({
                  value: o.id,
                  label: o.name,
                })),
              )}
              {choice(
                index,
                "slotId",
                "Calendar slot",
                (options.data?.slots ?? []).map((s) => ({
                  value: s.id,
                  label: `${s.plannedAt?.slice(0, 10) ?? "Undated"} · ${s.title ?? s.id}`,
                })),
              )}
              <label className="space-y-1 text-sm">
                Pillar
                <Input
                  disabled={locked}
                  value={row.pillar}
                  onChange={(e) => update(index, { pillar: e.target.value })}
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              Platform caption
              <Textarea
                disabled={locked}
                rows={4}
                value={row.caption}
                onChange={(e) => update(index, { caption: e.target.value })}
              />
            </label>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Brief, CTA and KPI
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {(
                  ["hook", "visualDirection", "cta", "keyword", "kpi"] as const
                ).map((key) => (
                  <label className="space-y-1 text-sm" key={key}>
                    {
                      {
                        hook: "Hook",
                        visualDirection: "Visual direction",
                        cta: "CTA",
                        keyword: "Keyword",
                        kpi: "KPI",
                      }[key]
                    }
                    <Textarea
                      disabled={locked}
                      value={row[key]}
                      onChange={(e) => update(index, { [key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
            </details>
          </article>
        );
      })}
      <nav className="flex items-center gap-4" aria-label="Workbook pages">
        <Button
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span className="text-sm">
          Page {page + 1} of {Math.ceil(document.rows.length / 20)}
        </span>
        <Button
          variant="outline"
          disabled={(page + 1) * 20 >= document.rows.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </nav>
    </main>
  );
}
