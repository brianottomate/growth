"use client";
import { WorkspaceCardHeader } from "@/app/app/performance/WorkspaceCard";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Pencil, Sparkles, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { sendAssistantIntent } from "@/lib/assistant-events";
import type { ChannelPlatform, DeliveryGeography } from "@/server/db/schema";
import { orpc } from "@/orpc/client";

import { useSuggestedAudiences } from "./SuggestAudiencesButton";
import { AudienceGeography } from "./AudienceGeography";

type AudienceRow = {
  id: string;
  name: string;
  personaId: string | null;
  persona?: { id: string; name: string } | null;
  description: string | null;
  geography?: DeliveryGeography | null;
};

/**
 * Shared campaign intent and intended geography. Executable targeting is
 * configured separately in each platform plan's delivery groups.
 */
export function Audiences({
  campaignId,
  campaignName,
  brandId,
  brandName,
  audiences,
  metaTargets = {},
  personas = [],
  platforms = [],
}: {
  campaignId: string;
  campaignName: string;
  brandId: string;
  brandName: string;
  audiences: AudienceRow[];
  personas?: { id: string; name: string }[];
  platforms?: ChannelPlatform[];
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
          retain their persona and explain campaign relevance.
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
              "Keep broad targeting, or add audiences from the brand’s evidence to describe who this campaign should reach. Shape lets you explore the targeting before changing it."
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div>
              <h3 className="font-semibold">Shared audiences</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Who we want to reach and why. Platform plans below show how each
                audience is used.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-4">
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
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <p>{row.description.split(/\n\s*\n/)[0]}</p>
                      {row.description.split(/\n\s*\n/).length > 1 && (
                        <details>
                          <summary className="cursor-pointer">
                            Planning rationale
                          </summary>
                          <p className="mt-2 whitespace-pre-line">
                            {row.description
                              .split(/\n\s*\n/)
                              .slice(1)
                              .join("\n\n")}
                          </p>
                        </details>
                      )}
                    </div>
                  )}
                  <AudienceGeography audience={row} />
                  <div className="flex flex-wrap gap-2 border-t pt-3 text-xs text-muted-foreground">
                    {platforms.includes("meta_ads") && (
                      <a
                        className="rounded-md bg-muted px-2 py-1 hover:text-foreground"
                        href="#platform-meta_ads"
                      >
                        Meta ·{" "}
                        {metaTargets[row.id]
                          ? "linked audience"
                          : "delivery plan"}
                      </a>
                    )}
                    {platforms.includes("google_ads") && (
                      <a
                        className="rounded-md bg-muted px-2 py-1 hover:text-foreground"
                        href="#platform-google_ads"
                      >
                        Google · delivery plan
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {remove.error && (
        <p className="mt-2 text-xs text-red-300">{remove.error.message}</p>
      )}
    </div>
  );
}
