"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { initiativeStatusSchema } from "@/lib/initiative";
import { MomentAmplifiers } from "../campaigns/[campaignId]/MomentAmplifiers";
import type { InitiativeSave } from "@/server/services/initiative.service";
const empty: InitiativeSave = {
  name: "",
  description: null,
  status: "planned",
  leadBrandId: null,
  ownerId: null,
  startAt: null,
  endAt: null,
};
function InitiativeEditor({
  initial,
  close,
}: {
  initial?: InitiativeSave;
  close: () => void;
}) {
  const [value, setValue] = useState<InitiativeSave>(initial ?? empty);
  const router = useRouter();
  const client = useQueryClient();
  const { data } = useQuery(
    orpc.initiative.options.queryOptions({ input: {} }),
  );
  const save = useMutation(
    orpc.initiative.save.mutationOptions({
      onSuccess: async (result) => {
        await client.invalidateQueries({ queryKey: orpc.initiative.key() });
        close();
        router.push(`/app/initiatives/${result.initiative.id}`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(value);
      }}
    >
      <label className="block space-y-1 text-sm">
        Name
        <Input
          required
          maxLength={200}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Brief
        <Textarea
          maxLength={10000}
          value={value.description ?? ""}
          onChange={(e) =>
            setValue({ ...value, description: e.target.value || null })
          }
        />
      </label>
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        <label className="space-y-1 text-sm">
          Status
          <SimpleSelect
            value={value.status}
            onValueChange={(v) =>
              setValue({ ...value, status: initiativeStatusSchema.parse(v) })
            }
            options={initiativeStatusSchema.options.map((s) => ({
              value: s,
              label: s,
            }))}
          />
        </label>
        <label className="space-y-1 text-sm">
          Lead brand
          <SimpleSelect
            value={value.leadBrandId ?? "none"}
            onValueChange={(v) =>
              setValue({ ...value, leadBrandId: v === "none" ? null : v })
            }
            options={[
              { value: "none", label: "Workspace initiative" },
              ...(data?.brands ?? []).map((b) => ({
                value: b.id,
                label: b.name,
              })),
            ]}
          />
        </label>
        <label className="space-y-1 text-sm">
          Owner
          <SimpleSelect
            value={value.ownerId ?? "none"}
            onValueChange={(v) =>
              setValue({ ...value, ownerId: v === "none" ? null : v })
            }
            options={[
              { value: "none", label: "Unassigned" },
              ...(data?.owners ?? []).map((o) => ({
                value: o.id,
                label: o.name ?? "Unnamed teammate",
              })),
            ]}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        {(["startAt", "endAt"] as const).map((key) => (
          <label key={key} className="space-y-1 text-sm">
            {key === "startAt" ? "Start date" : "End date"}
            <Input
              type="date"
              value={value[key]?.slice(0, 10) ?? ""}
              onChange={(e) =>
                setValue({
                  ...value,
                  [key]: e.target.value
                    ? `${e.target.value}T00:00:00.000Z`
                    : null,
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save initiative"}
        </Button>
      </div>
    </form>
  );
}
export function InitiativesClient() {
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading } = useQuery(
    orpc.initiative.list.queryOptions({ input: {} }),
  );
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Initiatives</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coordinate content and paid campaigns across brands around one push.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New initiative</Button>
      </div>
      {error && <p role="alert">{error.message}</p>}
      {isLoading && <p>Loading initiatives…</p>}
      {data?.initiatives.length === 0 && (
        <p className="text-muted-foreground">
          Create an initiative, then link existing series, content posts, and
          campaigns.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        {data?.initiatives.map((i) => (
          <Link
            key={i.id}
            href={`/app/initiatives/${i.id}`}
            className="rounded-xl border bg-card p-5 transition-colors hover:bg-accent/40"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{i.name}</h2>
              <span className="text-xs text-muted-foreground capitalize">
                {i.status}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
              {i.description}
            </p>
          </Link>
        ))}
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="@container">
          <DialogHeader>
            <DialogTitle>New initiative</DialogTitle>
            <DialogDescription>
              Give the push a shared brief. Link work after creating it.
            </DialogDescription>
          </DialogHeader>
          <InitiativeEditor close={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function InitiativeDetail({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [kind, setKind] = useState("contentPostId");
  const [picked, setPicked] = useState("");
  const client = useQueryClient();
  const { data, error, isLoading } = useQuery(
    orpc.initiative.get.queryOptions({ input: { id } }),
  );
  const { data: options } = useQuery({
    ...orpc.initiative.options.queryOptions({ input: {} }),
    enabled: linking,
  });
  const invalidate = () =>
    client.invalidateQueries({ queryKey: orpc.initiative.key() });
  const unlink = useMutation(
    orpc.initiative.unlink.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );
  const link = useMutation(
    orpc.initiative.link.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setLinking(false);
        setPicked("");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  if (error) return <p role="alert">{error.message}</p>;
  if (isLoading || !data) return <p>Loading initiative…</p>;
  const i = data.initiative;
  const brandName = (brandId: string) =>
    data.brands.find((b) => b.id === brandId)?.name ?? "Brand";
  const targets =
    kind === "seriesId"
      ? options?.series.map((s) => ({
          value: s.id,
          label: `${brandName(s.brandId)}: ${s.name}`,
        }))
      : kind === "campaignId"
        ? options?.campaigns.map((c) => ({
            value: c.id,
            label: `${brandName(c.brandId)}: ${c.name}`,
          }))
        : options?.posts.map((p) => ({
            value: p.id,
            label: `${brandName(p.brandId)}: ${p.title ?? "Untitled"}`,
          }));
  const target = (key: string, targetId: string) =>
    key === "seriesId"
      ? { seriesId: targetId }
      : key === "campaignId"
        ? { campaignId: targetId }
        : { contentPostId: targetId };
  const initial: InitiativeSave = {
    ...i,
    status: initiativeStatusSchema.parse(i.status),
  };
  const rows = (
    items: {
      id: string;
      label: string;
      status: string;
      brandId: string;
      href: string;
      key: string;
      direct: boolean;
    }[],
  ) => (
    <div className="mt-3 space-y-2">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing linked yet.</p>
      )}
      {items.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-3 rounded-lg border bg-card p-3"
        >
          <Link className="min-w-0 flex-1" href={row.href}>
            <div className="font-medium">{row.label}</div>
            <div className="text-xs text-muted-foreground">
              {brandName(row.brandId)} · {row.status}
              {!row.direct && " · Included through series"}
            </div>
          </Link>
          {row.direct && (
            <Button
              disabled={unlink.isPending}
              variant="ghost"
              size="sm"
              onClick={() => unlink.mutate({ id, ...target(row.key, row.id) })}
            >
              Unlink
            </Button>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <div className="space-y-6">
      <Link href="/app/initiatives" className="text-sm text-muted-foreground">
        ← Initiatives
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{i.name}</h1>
            <span className="rounded-full border px-3 py-1 text-xs capitalize">
              {i.status}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm whitespace-pre-line text-muted-foreground">
            {i.description}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {i.leadBrandId
              ? `Lead brand: ${brandName(i.leadBrandId)}`
              : "Workspace initiative"}
            {i.ownerId
              ? ` · Owner: ${data.owners.find((o) => o.id === i.ownerId)?.name ?? "Unassigned"}`
              : ""}
            {i.startAt ? ` · ${i.startAt.slice(0, 10)}` : ""}
            {i.endAt ? ` to ${i.endAt.slice(0, 10)}` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
      <Button onClick={() => setLinking(true)}>Link work</Button>
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
        <section>
          <h2 className="font-semibold">
            Content posts · {data.contentPosts.length}
          </h2>
          {rows(
            data.contentPosts.map((p) => ({
              ...p,
              label: p.title ?? "Untitled",
              href: `/app/content/${p.id}`,
              key: "contentPostId",
            })),
          )}
        </section>
        <div className="space-y-6">
          <section>
            <h2 className="font-semibold">Series · {data.series.length}</h2>
            {rows(
              data.series.map((s) => ({
                ...s,
                label: s.name,
                href: `/app/series/${s.id}`,
                key: "seriesId",
                direct: true,
              })),
            )}
          </section>
          <section>
            <h2 className="font-semibold">
              Paid campaigns · {data.campaigns.length}
            </h2>
            {rows(
              data.campaigns.map((c) => ({
                ...c,
                label: c.name,
                href: `/app/brands/${data.brands.find((b) => b.id === c.brandId)?.slug}/ads/${c.id}`,
                key: "campaignId",
                direct: true,
              })),
            )}
          </section>
        </div>
      </div>
      <MomentAmplifiers momentId={id} />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="@container">
          <DialogHeader>
            <DialogTitle>Edit initiative</DialogTitle>
            <DialogDescription>
              Keep the brief and ownership current.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <InitiativeEditor
              initial={initial}
              close={() => setEditing(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link work</DialogTitle>
            <DialogDescription>
              Link a series to include all its current and future posts.
              Individual posts and campaigns can belong to multiple initiatives.
            </DialogDescription>
          </DialogHeader>
          <SimpleSelect
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              setPicked("");
            }}
            options={[
              { value: "contentPostId", label: "Content post" },
              { value: "seriesId", label: "Series" },
              { value: "campaignId", label: "Paid campaign" },
            ]}
          />
          <SimpleSelect
            value={picked}
            onValueChange={setPicked}
            placeholder="Choose work"
            options={targets ?? []}
          />
          <Button
            disabled={!picked || link.isPending}
            onClick={() => link.mutate({ id, ...target(kind, picked) })}
          >
            {link.isPending ? "Linking…" : "Link"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
