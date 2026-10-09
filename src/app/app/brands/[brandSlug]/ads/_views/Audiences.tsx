"use client";
import { WorkspaceCardHeader } from "@/app/app/performance/WorkspaceCard";

import { useState } from "react";
import { AudienceMap } from "@/components/audience-map";
import { GeographyChips } from "@/components/geography-chips";
import { MessageSquare, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { sendAssistantIntent } from "@/lib/assistant-events";
import type { DeliveryGeography } from "@/server/db/schema";
import { audienceAgeLabel } from "@/lib/audience-age";

import { useSuggestedAudiences } from "./SuggestAudiencesButton";
import { AudienceGeography } from "./AudienceGeography";

type AudienceRow = {
  id: string;
  name: string;
  personaId: string | null;
  persona?: { id: string; name: string } | null;
  description: string | null;
  geography?: DeliveryGeography | null;
  ageMin?: number | null;
  ageMax?: number | null;
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
  personas = [],
}: {
  campaignId: string;
  campaignName: string;
  brandId: string;
  brandName: string;
  audiences: AudienceRow[];
  personas?: { id: string; name: string }[];
}) {
  const [selection, setSelection] = useState("all");
  const selected = audiences.find((row) => row.id === selection);
  const visibleAudiences = selected ? [selected] : audiences;
  const rolledUp = Object.fromEntries(
    (["countries", "states", "regions", "cities"] as const).map((key) => [
      key,
      [
        ...new Set(
          visibleAudiences.flatMap((row) => row.geography?.[key] ?? []),
        ),
      ],
    ]),
  );
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
          Persona context: {personas.map((p) => p.name).join(" · ")}.
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
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="space-y-3" aria-label="Campaign audiences">
            <p className="text-xs text-muted-foreground">
              Who we want to reach and why. Select an audience to see its
              geography.
            </p>
            <div className="space-y-3">
              {audiences.map((row) => (
                <div
                  key={row.id}
                  className={`space-y-3 rounded-xl border p-4 ${selected?.id === row.id ? "border-foreground/30 bg-muted/50" : "bg-card"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        className="text-left text-sm font-semibold hover:underline"
                        aria-pressed={selected?.id === row.id}
                        onClick={() => setSelection(row.id)}
                      >
                        {row.name}
                      </button>
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
                        aria-label={`Shape ${row.name}`}
                        title="Shape audience"
                        onClick={() =>
                          sendAssistantIntent({
                            type: "work_ad_campaign",
                            brandId,
                            brandName,
                            campaignId,
                            campaignName,
                            focus: "audiences",
                            visibleText: `Help me shape the audience “${row.name}” (${row.id}) in “${campaignName}”. Read its current name, description, persona, age range and geography, then ask what I would like to change. Audience edits, including age, and removal belong here.`,
                          })
                        }
                      >
                        <MessageSquare className="size-3.5" />
                        Shape
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] text-muted-foreground">
                        Age
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        {audienceAgeLabel(row)}
                      </span>
                    </div>
                    {(
                      [
                        ["cities", "Cities"],
                        ["states", "States"],
                        ["regions", "Regions"],
                      ] as const
                    ).map(([key, label]) => (
                      <GeographyChips
                        key={key}
                        label={label}
                        values={row.geography?.[key]}
                      />
                    ))}
                    <GeographyChips
                      label="Countries"
                      values={[
                        ...(row.geography?.countries ?? []),
                        ...(row.geography?.states?.length ? ["US"] : []),
                      ]}
                    />
                  </div>
                  {row.description && (
                    <p className="text-xs whitespace-pre-line text-muted-foreground">
                      {row.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section
            className="min-w-0 space-y-3 @4xl:border-l @4xl:pl-6"
            aria-label="Intended geography overview"
          >
            <AudienceMap
              audiences={audiences.map((row) => ({
                ...row,
                geography: row.geography ?? null,
              }))}
              context="intent"
              selection={selected?.id ?? "all"}
              onSelectionChange={setSelection}
            />
            {selected ? (
              <AudienceGeography key={selected.id} audience={selected} />
            ) : (
              <div className="space-y-2 border-t pt-3">
                {(["countries", "states", "regions", "cities"] as const).map(
                  (key) => (
                    <GeographyChips
                      key={key}
                      label={key.charAt(0).toUpperCase() + key.slice(1)}
                      values={rolledUp[key]}
                    />
                  ),
                )}
                <p className="text-xs text-muted-foreground">
                  Combined intended geography across {audiences.length}{" "}
                  audiences. Select an audience to edit.
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Campaign intent. Delivery targeting is configured in each platform
              plan.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
