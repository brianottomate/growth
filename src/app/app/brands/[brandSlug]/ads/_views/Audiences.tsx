"use client";
import { WorkspaceCardHeader } from "@/app/app/performance/WorkspaceCard";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Pencil, Sparkles, Trash2, Users } from "lucide-react";

import { AudienceMap } from "@/components/audience-map";
import { GeographyChips } from "@/components/geography-chips";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { orpc } from "@/orpc/client";

import { useSuggestedAudiences } from "./SuggestAudiencesButton";

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
  homeIds: string[] | null;
  description: string | null;
  keywords: string[] | null;
  excludedKeywords?: string[] | null;
};

/**
 * The campaign's audiences: each row is one buyable narrowing that the push
 * compiles to a Meta ad set and, when it has search terms, a Google ad group. Budgets here are advisory
 * splits; the authoritative number lives on each platform's draft.
 */
export function Audiences({
  campaignId,
  campaignName,
  brandId,
  brandName,
  audiences,
  metaTargets = {},
  personas = [],
}: {
  campaignId: string;
  campaignName: string;
  brandId: string;
  brandName: string;
  audiences: AudienceRow[];
  personas?: { id: string; name: string }[];
  /** The Meta audience each ad set will target, by campaign audience id. */
  metaTargets?: Record<string, { name: string; via: "audience" | "persona" }>;
}) {
  const router = useRouter();
  const { busy, run, phase, label } = useSuggestedAudiences(campaignId);
  // A chat on this campaign's audiences; Suggest is the one-click add.
  const audienceChat = () =>
    sendAssistantIntent({
      type: "work_ad_campaign",
      newThread: true,
      brandId,
      brandName,
      campaignId,
      campaignName,
      focus: "audiences",
      visibleText: `Help me with the audiences for “${campaignName}”. Read what it targets now and ask what I would like to add or change.`,
    });
  const remove = useMutation(
    orpc.ads.deleteAudience.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  const actions = (primary = false) => (
    <>
      <Button
        size="sm"
        variant={primary ? "default" : "outline"}
        loading={busy}
        onClick={() => void run()}
      >
        {!busy && <Sparkles className="size-3.5" />}
        {label}
      </Button>
      <Button size="sm" variant="outline" onClick={audienceChat}>
        <MessageSquare className="size-3.5" />
        Shape
      </Button>
    </>
  );
  return (
    <div className="space-y-4">
      <WorkspaceCardHeader
        title="Audiences"
        icon={Users}
        count={audiences.length || "Broad"}
        actions={actions()}
      />
      {personas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Brand personas: {personas.map((p) => p.name).join(" · ")}. Suggestions
          retain their persona and explain proposed targeting.
        </p>
      )}
      {busy && audiences.length > 0 && (
        <p role="status" className="text-xs text-muted-foreground">
          {phase === "saving"
            ? "Saving the suggested audiences…"
            : "Reading personas and market evidence to suggest audiences…"}
        </p>
      )}
      {audiences.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title="Broad"
          actions={actions(true)}
          description={
            busy ? (
              <span role="status">
                {phase === "saving"
                  ? "Saving the suggested audiences…"
                  : "Reading personas and market evidence to suggest audiences…"}
              </span>
            ) : (
              "Keep broad targeting, or add audiences from the brand’s evidence to narrow by age or place. Shape lets you explore the targeting before changing it."
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div>
              <h3 className="font-semibold">Guest-origin coverage</h3>
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
                {row.description && (
                  <p className="text-xs text-muted-foreground">
                    {row.description}
                  </p>
                )}
                <div className="space-y-2 border-t pt-3">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Platform targeting
                  </h4>
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
                    label="Search terms"
                    values={row.keywords ?? undefined}
                  />
                  <GeographyChips
                    label="Excluded terms"
                    values={row.excludedKeywords ?? undefined}
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
