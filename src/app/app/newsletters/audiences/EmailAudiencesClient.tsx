"use client";
import { useRef, useState } from "react";
import { parse } from "csv-parse/browser/esm/sync";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { orpc } from "@/orpc/client";
import { Users, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspaceCard } from "@/app/app/performance/WorkspaceCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { sendAssistantIntent } from "@/lib/assistant-events";
import {
  emailAudienceDefinitionKey,
  type EmailAudienceDefinition,
} from "@/lib/email-audience";

type Brand = {
  id: string;
  name: string;
  slug: string | null;
  wanderOsWebsiteId: string | null;
};
export function EmailAudiencesClient({
  brands,
  embedded = false,
}: {
  brands: Brand[];
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const TitleTag = embedded ? "h2" : "h1";
  const [brandId, setBrandId] = useState(
    brands.find((b) => b.slug === "wander")?.id ?? brands[0]?.id ?? "",
  );
  const brand = brands.find((b) => b.id === brandId);
  const [name, setName] = useState(
    brands.find((b) => b.slug === "wander")
      ? "Recent email clickers"
      : "Guests and signups",
  );
  const [days, setDays] = useState("90");
  const [consent, setConsent] = useState(false);
  const [kinds, setKinds] = useState<Array<"bookers" | "signups">>([
    "bookers",
    "signups",
  ]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [savedDefinition, setSavedDefinition] = useState<string>();
  const [listId, setListId] = useState<string | null>(null);
  const [sample, setSample] = useState("");
  const [upload, setUpload] = useState<{
    fileName: string;
    rows: Array<{
      email: string;
      firstName: string | null;
      sourceId: string | null;
    }>;
  }>();
  const [appendTo, setAppendTo] = useState("");
  const appendMembers = useMutation(
    orpc.newsletter.addAudienceMembers.mutationOptions(),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const definition: EmailAudienceDefinition = {
    source: listId
      ? "list"
      : brand?.slug === "wander"
        ? "wander_cio"
        : "wanderos",
    listId,
    clickedWithinDays:
      !listId && brand?.slug === "wander" && days !== "all"
        ? Number(days)
        : null,
    guestKinds: kinds,
    consentConfirmed: consent,
    sampleSize: Number(sample) > 0 ? Math.floor(Number(sample)) : null,
  };
  const audiences = useQuery(
    orpc.newsletter.audiences.queryOptions({
      input: { brandId },
      enabled: Boolean(brandId),
      refetchInterval: 10000,
    }),
  );
  const preview = useMutation(
    orpc.newsletter.previewAudience.mutationOptions(),
  );
  const save = useMutation(orpc.newsletter.saveAudience.mutationOptions());
  const importList = useMutation(orpc.newsletter.importList.mutationOptions());
  const previewMatches =
    Boolean(preview.data) &&
    preview.variables?.brandId === brandId &&
    (preview.variables
      ? emailAudienceDefinitionKey(preview.variables.definition)
      : undefined) === emailAudienceDefinitionKey(definition);
  const report = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : "Audience operation failed",
    );
  const resetPreview = () => {
    preview.reset();
  };
  const startNew = () => {
    setAppendTo("");
    setOpen(true);
    setSelectedId(undefined);
    setName("New audience");
    setConsent(false);
    setListId(null);
    setSample("");
    setUpload(undefined);
    resetPreview();
  };
  // Parsed here so only the needed columns travel: a newsletter export is
  // several megabytes, mostly columns we never use.
  const readList = async (file: File) => {
    const records: Array<Record<string, string>> = parse(await file.text(), {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
    const headers = Object.keys(records[0] ?? {});
    const column = (pattern: RegExp) => headers.find((h) => pattern.test(h));
    const email = column(/^e-?mail( address)?$/i);
    if (!email) {
      toast.error("The file needs an Email or Email Address column.");
      return;
    }
    const firstName = column(/^first[ _]?name$/i);
    const sourceId = column(/^(leid|id|contact id)$/i);
    const target = selectedId && listId && consent ? selectedId : "";
    startNew();
    setAppendTo(target);
    setName(file.name.replace(/\.csv$/i, ""));
    setUpload({
      fileName: file.name,
      rows: records.map((r) => ({
        email: r[email] ?? "",
        firstName: firstName ? (r[firstName] ?? null) : null,
        sourceId: sourceId ? (r[sourceId] ?? null) : null,
      })),
    });
  };
  const uploadButton = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void readList(file).catch(report);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={!brand || importList.isPending}
        onClick={() => fileInput.current?.click()}
      >
        Upload list
      </Button>
    </>
  );
  const savedAudiences = (
    <aside
      className={embedded ? "space-y-3" : "space-y-4 rounded-xl border p-4"}
    >
      {!embedded && (
        <label className="block text-sm">
          Brand
          <select
            aria-label="Brand"
            disabled={save.isPending}
            value={brandId}
            className="mt-2 w-full rounded-md border bg-background p-2"
            onChange={(e) => {
              setBrandId(e.target.value);
              setName(
                brands.find((b) => b.id === e.target.value)?.slug === "wander"
                  ? "Recent email clickers"
                  : "Guests and signups",
              );
              setSelectedId(undefined);
              setConsent(false);
              resetPreview();
            }}
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!embedded && <h3 className="text-sm font-medium">Saved audiences</h3>}
      {audiences.error && (
        <p className="text-sm text-muted-foreground">
          {audiences.error.message}
        </p>
      )}
      {!audiences.data?.length &&
        !audiences.error &&
        (audiences.isPending ? (
          <p className="text-sm text-muted-foreground">Loading audiences…</p>
        ) : (
          <EmptyState compact icon={Users} title="No saved audiences yet" />
        ))}
      {audiences.data?.map((a) => (
        <button
          disabled={save.isPending}
          key={a.id}
          className="block w-full rounded-md border p-3 text-left text-sm hover:bg-muted"
          onClick={() => {
            if (embedded) setOpen(true);
            setSelectedId(a.id);
            setSavedDefinition(emailAudienceDefinitionKey(a.definition));
            setName(a.name);
            setDays(
              a.definition.clickedWithinDays === null
                ? "all"
                : String(a.definition.clickedWithinDays),
            );
            setKinds(a.definition.guestKinds);
            setConsent(a.definition.consentConfirmed);
            setListId(a.definition.listId ?? null);
            setSample(
              a.definition.sampleSize ? String(a.definition.sampleSize) : "",
            );
            setUpload(undefined);
            resetPreview();
          }}
        >
          {a.name}
          <span className="mt-1 block text-xs text-muted-foreground">
            {a.recipientCount !== null &&
              `${a.recipientCount.toLocaleString()} current members`}
          </span>
        </button>
      ))}
      {!embedded && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={save.isPending}
            onClick={startNew}
          >
            New audience
          </Button>
          {uploadButton}
        </div>
      )}
    </aside>
  );
  const editor = (
    <section
      className={embedded ? "space-y-5" : "space-y-5 rounded-xl border p-5"}
    >
      {!(upload && appendTo) && (
        <>
          <label className="block text-sm">
            Audience name
            <Input
              value={name}
              className="mt-2"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Source:{" "}
        {upload
          ? `${upload.fileName} · ${upload.rows.length.toLocaleString()} rows, not uploaded yet`
          : listId
            ? "Database list"
            : brand?.slug === "wander"
              ? "Wander’s Customer.io warehouse export"
              : "This brand’s WanderOS guests and signups"}
      </p>
      {upload || listId ? null : brand?.slug === "wander" ? (
        <label className="block text-sm">
          Email engagement
          <select
            aria-label="Email engagement"
            className="mt-2 w-full rounded-md border bg-background p-2"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              resetPreview();
            }}
          >
            {[30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                Clicked in the last {d} days
              </option>
            ))}
            <option value="all">All subscriber candidates</option>
          </select>
          <span className="mt-2 block text-xs text-muted-foreground">
            Known machine and prefetched clicks are excluded. Opens aren’t used
            as engagement.
          </span>
        </label>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm">Include</legend>
          {(["bookers", "signups"] as const).map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={kinds.includes(kind)}
                onChange={(e) => {
                  setKinds(
                    e.target.checked
                      ? [...kinds, kind]
                      : kinds.filter((k) => k !== kind),
                  );
                  resetPreview();
                }}
              />
              {kind === "bookers"
                ? "Guests with confirmed bookings"
                : "Website signups"}
            </label>
          ))}
        </fieldset>
      )}
      {listId && selectedId && !upload && (
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          Add contacts
        </Button>
      )}
      {!upload && (
        <label className="block text-sm">
          Random sample
          <Input
            type="number"
            min={1}
            placeholder="Everyone"
            value={sample}
            className="mt-2 w-40"
            onChange={(e) => {
              setSample(e.target.value);
              resetPreview();
            }}
          />
          <span className="mt-2 block text-xs text-muted-foreground">
            Optional subset for a test edition. Each email edition has one
            delivery run; use another edition for a separate broadcast.
          </span>
        </label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            resetPreview();
          }}
        />
        I have confirmed marketing permission for this audience. A booking alone
        does not establish it.
      </label>
      {upload && (
        <label className="block text-sm">
          Add contacts to
          <select
            className="mt-2 w-full rounded-md border bg-background p-2"
            value={appendTo}
            onChange={(e) => setAppendTo(e.target.value)}
          >
            <option value="">Create a new audience</option>
            {audiences.data
              ?.filter(
                (a) => a.definition.listId && a.definition.consentConfirmed,
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <span className="mt-2 block text-xs text-muted-foreground">
            New contacts join editions that have not started delivery. Completed
            editions are not resent.
          </span>
        </label>
      )}
      {upload && appendTo ? (
        <Button
          loading={appendMembers.isPending}
          disabled={!consent}
          onClick={() =>
            appendMembers.mutate(
              {
                audienceId: appendTo,
                consentConfirmed: true,
                rows: upload.rows,
              },
              {
                onSuccess: (result) => {
                  setUpload(undefined);
                  void audiences.refetch();
                  setSelectedId(appendTo);
                  setOpen(false);
                  toast.success(`${result.imported} new contacts added`);
                },
                onError: report,
              },
            )
          }
        >
          Add contacts to audience
        </Button>
      ) : upload ? (
        <Button
          loading={importList.isPending}
          disabled={!name.trim() || !brandId}
          onClick={() =>
            importList.mutate(
              {
                brandId,
                name,
                fileName: upload.fileName,
                consentConfirmed: consent,
                rows: upload.rows,
              },
              {
                onSuccess: (result) => {
                  const a = result.audience;
                  setUpload(undefined);
                  setSelectedId(a.id);
                  setListId(a.definition.listId);
                  setSavedDefinition(emailAudienceDefinitionKey(a.definition));
                  void audiences.refetch();
                  toast.success(
                    `${result.imported.toLocaleString()} addresses saved` +
                      (result.duplicates || result.invalid
                        ? ` · ${result.duplicates} duplicates and ${result.invalid} invalid dropped`
                        : "") +
                      (result.namesCleared
                        ? ` · ${result.namesCleared.toLocaleString()} generated first names cleared`
                        : ""),
                  );
                },
                onError: report,
              },
            )
          }
        >
          {importList.isPending ? "Uploading list…" : "Upload list"}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            loading={preview.isPending}
            onClick={() =>
              preview.mutate({ brandId, definition }, { onError: report })
            }
          >
            {preview.isPending ? "Previewing recipients…" : "Preview audience"}
          </Button>
          <Button
            variant="outline"
            loading={save.isPending}
            disabled={!name.trim()}
            onClick={() =>
              save.mutate(
                {
                  brandId,
                  id: selectedId,
                  name,
                  definition,
                },
                {
                  onSuccess: (a) => {
                    setSelectedId(a.id);
                    setSavedDefinition(
                      emailAudienceDefinitionKey(a.definition),
                    );
                    void audiences.refetch();
                    toast.success("Audience saved");
                  },
                  onError: report,
                },
              )
            }
          >
            {save.isPending ? "Saving audience…" : "Save audience"}
          </Button>
          {selectedId &&
            savedDefinition === emailAudienceDefinitionKey(definition) && (
              <Button variant="outline" asChild>
                <a href={`/api/newsletters/audiences/${selectedId}`}>
                  Download audience CSV
                </a>
              </Button>
            )}
        </div>
      )}
      {preview.error && (
        <p role="alert" className="text-sm text-destructive">
          {preview.error.message}
        </p>
      )}
      {previewMatches && preview.data && (
        <div className="space-y-4 border-t pt-4">
          <div>
            <strong className="text-3xl tabular-nums">
              {preview.data.candidateCount.toLocaleString()}
            </strong>
            <p className="text-sm text-muted-foreground">
              Candidate recipients · checked{" "}
              {new Date(preview.data.checkedAt).toLocaleString()}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {preview.data.sourceLoadedThrough
              ? `Data updated through ${preview.data.sourceLoadedThrough}. Recent changes may not appear yet.`
              : "Recent guest activity and opt-outs may not appear yet."}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {preview.data.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2">Email</th>
                  <th>Name</th>
                  <th>Why included</th>
                </tr>
              </thead>
              <tbody>
                {preview.data.sample.map((r) => (
                  <tr key={r.email} className="border-t">
                    <td className="py-2 pr-3">{r.email}</td>
                    <td className="pr-3">{r.first_name ?? "—"}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">
              Generated BigQuery SQL
            </summary>
            <p className="mt-3 text-xs text-muted-foreground">
              {preview.data.estimatedBytes
                ? `Estimated data scanned: ${(Number(preview.data.estimatedBytes) / 1e9).toFixed(2)} GB.`
                : "BigQuery does not provide a reliable scan estimate for these source tables."}{" "}
              Each query has a 100 GB billing limit.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {preview.data.querySql}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
  const audienceActions = (
    <>
      <Button
        variant={audiences.data?.length ? "outline" : "default"}
        size="sm"
        disabled={save.isPending}
        onClick={startNew}
      >
        New audience
      </Button>
      {uploadButton}
      <Button
        size="sm"
        variant="outline"
        disabled={!brand}
        onClick={() =>
          brand &&
          sendAssistantIntent({
            type: "work_email_audience",
            newThread: true,
            brandId: brand.id,
            brandName: brand.name,
            visibleText: `Help me choose email recipients for ${brand.name}. Compare counts and inclusion reasons before saving.`,
          })
        }
      >
        <MessageSquare className="size-4" />
        Shape
      </Button>
    </>
  );
  if (embedded)
    return (
      <WorkspaceCard
        id="email-audiences"
        title="Audiences"
        icon={Users}
        count={audiences.data?.length ?? 0}
        actions={audienceActions}
      >
        {audiences.data?.length || audiences.isPending || audiences.error ? (
          savedAudiences
        ) : (
          <EmptyState
            compact
            icon={Users}
            title="Choose who receives your emails"
            description="Choose recipient rules, preview who qualifies, then save the audience. Emails read its current members when they send."
            actions={audienceActions}
          />
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent size="xl" scrollable>
            <DialogHeader>
              <DialogTitle>
                {upload && appendTo
                  ? "Add contacts"
                  : selectedId
                    ? "Edit audience"
                    : "New audience"}
              </DialogTitle>
              <DialogDescription>
                Preview recipients and save the selection. Database-list
                membership resolves when each edition starts delivery.
              </DialogDescription>
            </DialogHeader>
            {editor}
          </DialogContent>
        </Dialog>
      </WorkspaceCard>
    );
  return (
    <div
      id={embedded ? "email-audiences" : undefined}
      className={
        embedded ? "w-full space-y-6" : "mx-auto w-full max-w-6xl space-y-6 p-6"
      }
    >
      <div>
        <Link
          href={embedded ? "/app/newsletters/audiences" : "/app/newsletters"}
          className="text-sm text-muted-foreground"
        >
          {embedded ? "All email audiences" : "Newsletters"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <TitleTag className="text-2xl font-semibold">
            Email audiences
          </TitleTag>
          <Button
            variant="outline"
            disabled={!brand}
            onClick={() =>
              brand &&
              sendAssistantIntent({
                type: "work_email_audience",
                newThread: true,
                brandId: brand.id,
                brandName: brand.name,
                visibleText: `Help me choose email recipients for ${brand.name}. ${selectedId ? `Current audience: ${name} (${selectedId}). ` : ""}Current form rules: ${emailAudienceDefinitionKey(definition)}. Compare counts and inclusion reasons before saving.`,
              })
            }
          >
            Discuss in chat
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a saved database audience and inspect its current members. New
          contacts join future editions automatically. Warehouse sources remain
          available as fixed selections.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[280px_1fr]">
        {savedAudiences}
        {editor}
      </div>
    </div>
  );
}
