"use client";

import { CampaignPlatforms } from "@/components/campaigns/campaign-summary";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  sendAssistantIntent,
  type WorkInitiativeIntent,
} from "@/lib/assistant-events";

type Scope = Pick<
  WorkInitiativeIntent,
  "initiativeId" | "brandId" | "campaignId" | "contentPostId" | "platformPostId"
>;
type Section = WorkInitiativeIntent["section"];
const labels: Record<Section, string> = {
  overview: "initiative",
  campaigns: "campaign",
  series: "series",
  social: "social post",
  email: "email blast",
  blog: "blog post",
  ads: "ad",
  audiences: "audience",
  platforms: "platform plan",
};

export function InitiativeActions({
  scope,
  section,
  create = true,
}: {
  scope: Scope;
  section: Section;
  create?: boolean;
}) {
  const open = (mode: "create" | "shape") =>
    sendAssistantIntent({
      ...scope,
      type: "work_initiative",
      newThread: true,
      section,
      mode,
      visibleText:
        mode === "shape"
          ? `Help me shape the ${labels[section]} for this initiative. Read the linked work and discuss the direction before saving changes.`
          : section === "blog"
            ? "Prepare one blog brief for this initiative. Create and link its content post with a blog platform version, then create a typed article document with the brief and select it for that blog version. Include the audience, direction, CTA, known facts and sources, and flag unconfirmed claims. Save the brief only; do not write the article or push to Dato. Return a link to the content post where I can inspect the brief."
            : `Help me create one ${labels[section]} for this initiative. Start with its brief and save only that selected item.`,
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {create && (
        <Button size="sm" variant="outline" onClick={() => open("create")}>
          <Plus />
          {section === "blog"
            ? "Prepare blog brief"
            : `Create ${labels[section]}`}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => open("shape")}>
        <MessageSquare />
        Shape
      </Button>
    </div>
  );
}

/** Small read-only campaign plan summary beneath the creative previews. */
export function CampaignPlanPreview({
  audiences,
  platforms,
}: {
  audiences: { id: string; name: string; description: string | null }[];
  platforms: {
    id: string;
    platform: string;
    status: string;
    pushed: boolean;
  }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Audience</span>
        {audiences.length ? (
          audiences.map((a) => (
            <span
              key={a.id}
              title={a.description ?? undefined}
              className="rounded-md bg-muted/40 px-2 py-1"
            >
              {a.name}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">Not planned</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Platforms</span>
        <CampaignPlatforms
          expanded
          platforms={platforms.map((item) => ({
            ...item,
            status: item.pushed ? item.status : "Planned",
          }))}
        />
      </div>
    </div>
  );
}
