"use client";
import { useState } from "react";
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
  const [revision, setRevision] = useState<number | undefined>();
  const [snapshotId, setSnapshotId] = useState<string | undefined>();
  const definition: EmailAudienceDefinition = {
    source: brand?.slug === "wander" ? "wander_cio" : "wanderos",
    clickedWithinDays:
      brand?.slug === "wander" && days !== "all" ? Number(days) : null,
    guestKinds: kinds,
    consentConfirmed: consent,
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
  const compile = useMutation(
    orpc.newsletter.compileAudience.mutationOptions(),
  );
  const snapshot = useQuery(
    orpc.newsletter.audienceSnapshot.queryOptions({
      input: { snapshotId: snapshotId ?? "" },
      enabled: Boolean(snapshotId),
      refetchInterval: (query) =>
        query.state.data?.status === "compiling" ? 3000 : false,
    }),
  );
  const selectedIsCurrent =
    !selectedId ||
    audiences.data?.find((a) => a.id === selectedId)?.revision === revision;
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
    setSnapshotId(undefined);
  };
  const savedAudiences = (
    <aside
      className={embedded ? "space-y-3" : "space-y-4 rounded-xl border p-4"}
    >
      {!embedded && (
        <label className="block text-sm">
          Brand
          <select
            aria-label="Brand"
            disabled={save.isPending || compile.isPending}
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
              setRevision(undefined);
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
          disabled={save.isPending || compile.isPending}
          key={a.id}
          className="block w-full rounded-md border p-3 text-left text-sm hover:bg-muted"
          onClick={() => {
            if (embedded) setOpen(true);
            setSelectedId(a.id);
            setRevision(a.revision);
            setSavedDefinition(emailAudienceDefinitionKey(a.definition));
            setName(a.name);
            setDays(
              a.definition.clickedWithinDays === null
                ? "all"
                : String(a.definition.clickedWithinDays),
            );
            setKinds(a.definition.guestKinds);
            setConsent(a.definition.consentConfirmed);
            resetPreview();
            setSnapshotId(a.latestSnapshotId ?? undefined);
          }}
        >
          {a.name}
          <span className="mt-1 block text-xs text-muted-foreground">
            Revision {a.revision}
            {a.latestSnapshot && (
              <>
                {" "}
                · {a.latestSnapshot.recipientCount?.toLocaleString() ??
                  "—"}{" "}
                candidates ·{" "}
                {a.latestSnapshot.revision !== a.revision
                  ? "Earlier revision"
                  : Date.parse(a.latestSnapshot.expiresAt) <= Date.now()
                    ? "Expired"
                    : a.latestSnapshot.status}
              </>
            )}
          </span>
        </button>
      ))}
      {!embedded && (
        <Button
          variant="outline"
          size="sm"
          disabled={save.isPending || compile.isPending}
          onClick={() => {
            setOpen(true);
            setSelectedId(undefined);
            setRevision(undefined);
            setName("New audience");
            setConsent(false);
            resetPreview();
          }}
        >
          New audience
        </Button>
      )}
    </aside>
  );
  const editor = (
    <section
      className={embedded ? "space-y-5" : "space-y-5 rounded-xl border p-5"}
    >
      <label className="block text-sm">
        Audience name
        <Input
          value={name}
          className="mt-2"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        Source:{" "}
        {brand?.slug === "wander"
          ? "Wander’s Customer.io warehouse export"
          : "This brand’s WanderOS guests and signups"}
      </p>
      {brand?.slug === "wander" ? (
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
      {!selectedIsCurrent && (
        <p className="text-sm text-muted-foreground">
          This audience changed. Select it again from Saved audiences to load
          the latest revision.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={preview.isPending}
          onClick={() =>
            preview.mutate({ brandId, definition }, { onError: report })
          }
        >
          Preview audience
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
                expectedRevision: revision,
                name,
                definition,
              },
              {
                onSuccess: (a) => {
                  setSelectedId(a.id);
                  setRevision(a.revision);
                  setSavedDefinition(emailAudienceDefinitionKey(a.definition));
                  void audiences.refetch();
                  toast.success("Audience saved");
                },
                onError: report,
              },
            )
          }
        >
          Save audience
        </Button>
        <Button
          variant="outline"
          loading={compile.isPending}
          disabled={
            !selectedId ||
            !revision ||
            !previewMatches ||
            !selectedIsCurrent ||
            preview.isPending ||
            save.isPending ||
            savedDefinition !== emailAudienceDefinitionKey(definition) ||
            (preview.variables
              ? emailAudienceDefinitionKey(preview.variables.definition)
              : undefined) !== emailAudienceDefinitionKey(definition)
          }
          onClick={() =>
            compile.mutate(
              { audienceId: selectedId!, expectedRevision: revision! },
              {
                onSuccess: (s) => {
                  setSnapshotId(s.id);
                  void audiences.refetch();
                },
                onError: report,
              },
            )
          }
        >
          Compile saved revision
        </Button>
      </div>
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
      {snapshot.data && (
        <div className="space-y-2 rounded-lg border p-4">
          <h2 className="font-medium">
            Revision {snapshot.data.revision} snapshot: {snapshot.data.status}
          </h2>
          <p className="text-sm text-muted-foreground">
            {snapshot.data.recipientCount?.toLocaleString() ?? "Calculating"}{" "}
            candidates · expires{" "}
            {new Date(snapshot.data.expiresAt).toLocaleDateString()}
          </p>
          {snapshot.data.error && (
            <p className="text-sm text-destructive">{snapshot.data.error}</p>
          )}
          {snapshot.data.status === "ready" &&
            Date.parse(snapshot.data.expiresAt) > Date.now() && (
              <a
                href={`/api/newsletters/audiences/${snapshot.data.id}`}
                className="text-sm underline"
              >
                Download candidate CSV
              </a>
            )}
          <p className="text-xs text-muted-foreground">
            This snapshot does not send email. Current opt-outs, suppression and
            frequency checks are still required.
          </p>
        </div>
      )}
      {snapshot.error && (
        <p role="alert" className="text-sm text-destructive">
          {snapshot.error.message}
        </p>
      )}
    </section>
  );
  const audienceActions = (
    <>
      <Button
        variant={audiences.data?.length ? "outline" : "default"}
        size="sm"
        disabled={save.isPending || compile.isPending}
        onClick={() => {
          setOpen(true);
          setSelectedId(undefined);
          setRevision(undefined);
          setName("New audience");
          setConsent(false);
          resetPreview();
        }}
      >
        New audience
      </Button>
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
            visibleText: `Help me choose email recipients for ${brand.name}. Compare counts and inclusion reasons before saving or compiling anything.`,
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
        actions={audiences.data?.length ? audienceActions : undefined}
      >
        {audiences.data?.length || audiences.isPending || audiences.error ? (
          savedAudiences
        ) : (
          <EmptyState
            compact
            icon={Users}
            title="Choose who receives your emails"
            description="Define an audience, preview recipients, and save its rules."
            actions={audienceActions}
          />
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent size="xl" scrollable>
            <DialogHeader>
              <DialogTitle>
                {selectedId ? "Edit audience" : "New audience"}
              </DialogTitle>
              <DialogDescription>
                Preview recipients, save the rules, then compile a fixed
                candidate list.
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
                visibleText: `Help me choose email recipients for ${brand.name}. ${selectedId ? `Current audience: ${name} (${selectedId}), revision ${revision}. ` : ""}Current form rules: ${emailAudienceDefinitionKey(definition)}. Compare counts and inclusion reasons before saving or compiling anything.`,
              })
            }
          >
            Discuss in chat
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose recipients in the warehouse, inspect the count and sample, then
          compile a fixed candidate list. Guest profiles stay in BigQuery.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[280px_1fr]">
        {savedAudiences}
        {editor}
      </div>
    </div>
  );
}
