"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, ExternalLink } from "lucide-react";

import {
  launchDeliverableStatuses,
  launchStatuses,
  launchSurfaceLabels,
  type LaunchDeliverableStatus,
} from "@/lib/launch";
import { Input } from "@/components/ui/input";
import { orpc, type RouterOutputs } from "@/orpc/client";

type LaunchData = RouterOutputs["launch"]["get"];
type Member = { id: string; name: string | null; email: string | null };

const DELIVERABLE_STATUS_STYLES: Record<LaunchDeliverableStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  drafting: "bg-amber-500/15 text-amber-300",
  ready: "bg-sky-500/15 text-sky-300",
  shipped: "bg-emerald-500/15 text-emerald-300",
};

export function LaunchDetail({
  initial,
  members,
}: {
  initial: LaunchData;
  members: Member[];
}) {
  const router = useRouter();

  const query = useQuery({
    ...orpc.launch.get.queryOptions({ input: { launchId: initial.launch.id } }),
    initialData: initial,
  });
  const data = query.data;

  const refresh = () => {
    void query.refetch();
    router.refresh();
  };

  const setDeliverable = useMutation(
    orpc.launch.setDeliverable.mutationOptions({ onSuccess: refresh }),
  );
  const setFields = useMutation(
    orpc.launch.setFields.mutationOptions({ onSuccess: refresh }),
  );
  const setFeatures = useMutation(
    orpc.launch.setFeatures.mutationOptions({ onSuccess: refresh }),
  );

  const {
    launch,
    deliverables,
    series,
    campaigns,
    posts,
    next,
    features,
    unknownStoryIds,
  } = data;
  const shipping = features.filter((f) => f.shipping).map((f) => f.id);

  const toggleFeature = (id: string) =>
    setFeatures.mutate({
      launchId: launch.id,
      storyIds: shipping.includes(id)
        ? shipping.filter((s) => s !== id)
        : [...shipping, id],
    });
  const brief = launch.brief;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{launch.name}</h1>
          <select
            value={launch.status}
            onChange={(e) =>
              setFields.mutate({
                launchId: launch.id,
                status: e.target.value as (typeof launchStatuses)[number],
              })
            }
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            {launchStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">
          Tier {launch.tier} · {launch.maturity.replaceAll("_", " ")} ·{" "}
          {launch.targetDate ?? "no date"}
          {launch.product ? ` · ${launch.product.name}` : ""}
          {launch.marketingOwner?.name
            ? ` · ${launch.marketingOwner.name}`
            : ""}
        </p>
        {launch.sourceUrl && (
          <a
            href={launch.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Brief <ExternalLink className="size-3" />
          </a>
        )}
      </header>

      {next.length > 0 && (
        <section className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          {next.map((move) => (
            <p
              key={move}
              className="flex items-start gap-2 text-sm text-amber-200"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              {move}
            </p>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Message</h2>
        <dl className="space-y-2 text-sm">
          <Field label="One line" value={brief.oneLine} />
          <Field label="Changelog entry" value={brief.changelogEntry} />
          {brief.claims.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Claims</dt>
              <dd>
                <ul className="list-inside list-disc">
                  {brief.claims.map((claim) => (
                    <li key={claim}>{claim}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          <Field label="Not saying" value={brief.notSaying} />
          <Field label="Who it's for" value={brief.audience?.who} />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Features
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {shipping.length === 0
              ? `${launch.product?.name ?? "The product"} itself`
              : `${shipping.length} of ${features.length}`}
          </span>
        </h2>
        {features.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {launch.product?.name ?? "This product"} has no features in Product
            Atlas yet.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 @xl:grid-cols-2">
            {features.map((feature) => (
              <li key={feature.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
                  <input
                    type="checkbox"
                    checked={feature.shipping}
                    onChange={() => toggleFeature(feature.id)}
                    className="mt-1"
                  />
                  <span>
                    {feature.name}
                    {feature.job && (
                      <span className="block text-xs text-muted-foreground">
                        {feature.job}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {unknownStoryIds.length > 0 && (
          <p className="text-xs text-destructive">
            Not in this product&apos;s atlas: {unknownStoryIds.join(", ")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Launch plan</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Surface</th>
                <th className="py-2 font-medium">Owner</th>
                <th className="py-2 font-medium">Ready by</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {deliverables.map((d) => (
                <tr key={d.surface} className="border-b last:border-0">
                  <td className="py-2">{launchSurfaceLabels[d.surface]}</td>
                  <td className="py-2">
                    <select
                      value={d.ownerId ?? ""}
                      onChange={(e) =>
                        setDeliverable.mutate({
                          launchId: launch.id,
                          surface: d.surface,
                          ownerId: e.target.value || null,
                          ownerName:
                            members.find((m) => m.id === e.target.value)
                              ?.name ?? null,
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="">{d.ownerName ?? "Unassigned"}</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name ?? m.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <Input
                      type="date"
                      defaultValue={d.readyBy ?? ""}
                      onBlur={(e) =>
                        setDeliverable.mutate({
                          launchId: launch.id,
                          surface: d.surface,
                          readyBy: e.target.value || null,
                        })
                      }
                      textSize="xs"
                      className="h-7 w-36"
                    />
                  </td>
                  <td className="py-2">
                    <select
                      value={d.status}
                      onChange={(e) =>
                        setDeliverable.mutate({
                          launchId: launch.id,
                          surface: d.surface,
                          status: e.target.value as LaunchDeliverableStatus,
                        })
                      }
                      className={`rounded-full px-2 py-0.5 text-xs ${DELIVERABLE_STATUS_STYLES[d.status]}`}
                    >
                      {launchDeliverableStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-xs">
                    {d.resolved?.missing ? (
                      <span className="text-destructive">missing</span>
                    ) : d.resolved?.href ? (
                      <Link
                        href={d.resolved.href}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {d.resolved.label ?? "Open"}
                        <ExternalLink className="size-3" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Linked work</h2>
        {series.length === 0 && campaigns.length === 0 && posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing linked. Point a series, campaign, or idea at this launch to
            see it here.
          </p>
        ) : (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {series.map((s) => (
              <li key={s.id}>Series · {s.name}</li>
            ))}
            {campaigns.map((c) => (
              <li key={c.id}>Campaign · {c.name}</li>
            ))}
            {posts.map((p) => (
              <li key={p.id}>Idea · {p.title ?? "Untitled"}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
