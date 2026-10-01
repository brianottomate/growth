"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { AudienceMap } from "@/components/audience-map";
import { GeographyChips } from "@/components/geography-chips";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { orpc } from "@/orpc/client";

import { SuggestAudiencesButton } from "./SuggestAudiencesButton";

type AudienceRow = {
  id: string;
  name: string;
  personaId: string | null;
  persona?: { id: string; name: string } | null;
  ageMin: number | null;
  ageMax: number | null;
  geography: {
    countries?: string[];
    states?: string[];
    regions?: string[];
    cities?: string[];
  } | null;
  keywords: string[] | null;
};

/**
 * The campaign's audiences: each row is one buyable narrowing that the push
 * compiles to a Meta ad set / Google ad group. Budgets here are advisory
 * splits; the authoritative number lives on each platform's draft.
 */
export function Audiences({
  campaignId,
  campaignName,
  brandId,
  brandName,
  audiences,
  metaTargets = {},
}: {
  campaignId: string;
  campaignName: string;
  brandId: string;
  brandName: string;
  audiences: AudienceRow[];
  /** The Meta audience each ad set will target, by campaign audience id. */
  metaTargets?: Record<string, { name: string; via: "audience" | "persona" }>;
}) {
  const router = useRouter();
  // Adding works like editing: the chat asks who to reach and writes it.
  const addInChat = () =>
    sendAssistantIntent({
      type: "work_ad_campaign",
      brandId,
      brandName,
      campaignId,
      campaignName,
      focus: "audiences",
      visibleText: `Add an audience to “${campaignName}”. Ask me who to reach: ages and places.`,
    });
  const remove = useMutation(
    orpc.ads.deleteAudience.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <div className="space-y-2">
      <div
        className={
          audiences.length === 0
            ? "hidden"
            : "flex items-center justify-end gap-2"
        }
      >
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <SuggestAudiencesButton campaignId={campaignId} />
          <Button size="sm" variant="outline" onClick={addInChat}>
            <Plus className="size-3.5" />
            Add audience
          </Button>
        </div>
      </div>

      {audiences.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title="Broad, for now"
          description="The push runs one broad ad set. Add an audience to narrow by age or place."
          actions={
            <>
              <SuggestAudiencesButton campaignId={campaignId} />
              <Button size="sm" variant="outline" onClick={addInChat}>
                <Plus className="size-3.5" />
                Add audience
              </Button>
            </>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div>
              <h3 className="font-semibold">Guest-origin coverage</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Where this campaign will look for guests. Each audience becomes
                a separate ad set.
              </p>
            </div>
            {audiences.map((row) => (
              <div key={row.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{row.name}</p>
                    {row.persona && (
                      <p className="text-xs text-muted-foreground">
                        {row.persona.name}
                      </p>
                    )}
                    {metaTargets[row.id] && (
                      <p className="text-xs text-muted-foreground">
                        Meta audience: {metaTargets[row.id]!.name}
                        {metaTargets[row.id]!.via === "persona"
                          ? " · from persona"
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      tone="muted"
                      className="h-7"
                      aria-label={`Edit ${row.name} in chat`}
                      title="Edit audience in chat"
                      onClick={() =>
                        sendAssistantIntent({
                          type: "work_ad_campaign",
                          brandId,
                          brandName,
                          campaignId,
                          campaignName,
                          focus: "audiences",
                          visibleText: `Help me edit the audience “${row.name}” (${row.id}) in “${campaignName}”. Read its current settings and ask what I would like to change.`,
                        })
                      }
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      tone="muted"
                      className="h-7"
                      aria-label={`Remove ${row.name}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ audienceId: row.id })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <GeographyChips
                    label="Countries"
                    values={row.geography?.countries}
                  />
                  <GeographyChips
                    label="States"
                    values={row.geography?.states}
                  />
                  <GeographyChips
                    label="Regions"
                    values={row.geography?.regions}
                  />
                  <GeographyChips
                    label="Cities"
                    values={row.geography?.cities}
                  />
                  <GeographyChips
                    label="Keyword suggestions"
                    values={row.keywords ?? undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.ageMin != null || row.ageMax != null
                      ? `Ages ${row.ageMin ?? 13}–${row.ageMax ?? "65+"}`
                      : "No age narrowing"}
                  </p>
                </div>
              </div>
            ))}
          </section>
          <aside className="space-y-4 rounded-xl border bg-card p-5">
            <AudienceMap audiences={audiences} />
          </aside>
        </div>
      )}
      {remove.error && (
        <p className="mt-2 text-xs text-red-300">{remove.error.message}</p>
      )}
    </div>
  );
}
