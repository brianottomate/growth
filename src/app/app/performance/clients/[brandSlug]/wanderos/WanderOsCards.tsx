import { House, Link2, Unlink, CircleHelp, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { AddHomesByHand, type HandHome } from "../AddHomesByHand";
import { HomeRowsGrid, type RowHome } from "../HomeRowsGrid";
import { PreparationAction } from "../PreparationAction";
import {
  ImportWanderOsButton,
  WanderOsInventoryActions,
} from "./WanderOsImport";
import { brandTabHref } from "../_data";

export function WanderOsConnectionCard({
  brandId,
  brandSlug,
  website,
  connected,
  checked,
}: {
  brandId: string;
  brandSlug: string;
  website: string | null;
  connected: boolean;
  checked: boolean;
}) {
  const status = (
    <Badge variant={connected ? "secondary" : "outline"}>
      {connected ? <Link2 /> : checked ? <Unlink /> : <CircleHelp />}
      {connected
        ? "Website detected · import needed"
        : checked
          ? "WanderOS not connected"
          : "WanderOS not checked"}
    </Badge>
  );
  const check = website ? (
    <PreparationAction
      brandId={brandId}
      kind="wanderos"
      label={checked ? "Recheck WanderOS" : "Check WanderOS"}
    />
  ) : (
    <ButtonLink href={brandTabHref(brandSlug, "settings")}>
      Add website
    </ButtonLink>
  );
  return (
    <WorkspaceCard title="WanderOS" icon={Link2} actions={status}>
      <EmptyState
        icon={Link2}
        title={
          connected
            ? "Bring your WanderOS homes into Growth"
            : checked
              ? "Connect the client’s WanderOS website"
              : "Check for a WanderOS website"
        }
        description={
          connected
            ? "Import homes, suggest Featured homes, and draft destinations. You can edit these selections afterward. Catalog copy is written using the current hero, with AI notes for anything worth reviewing."
            : "Check the client’s website for WanderOS. Once connected, import its homes here. You can also prepare homes manually below."
        }
        actions={connected ? <ImportWanderOsButton brandId={brandId} /> : check}
      />
    </WorkspaceCard>
  );
}

export function AllHomesCard({
  homes,
  brandSlug,
  brandId,
  connected,
}: {
  brandId: string;
  connected: boolean;
  homes: RowHome[];
  brandSlug: string;
}) {
  return (
    <WorkspaceCard
      title="All homes"
      icon={House}
      count={homes.length}
      titleAccessory={
        <Badge variant={connected ? "secondary" : "outline"}>
          {connected ? <Link2 /> : <Unlink />}
          {connected ? "WanderOS connected" : "WanderOS not connected"}
        </Badge>
      }
      actions={
        <WanderOsInventoryActions brandId={brandId} connected={connected} />
      }
    >
      {homes.length ? (
        <HomeRowsGrid homes={homes} brandSlug={brandSlug} />
      ) : (
        <EmptyState
          compact
          icon={House}
          title="Your homes will appear here"
          description="Import homes from WanderOS above, or add home details manually below."
        />
      )}
    </WorkspaceCard>
  );
}

export function ManualHomesCard({
  brandId,
  brandSlug,
  website,
  connected,
  homes,
}: {
  brandId: string;
  brandSlug: string;
  website: string | null;
  connected: boolean;
  homes: HandHome[];
}) {
  const editor = (
    <AddHomesByHand
      brandId={brandId}
      brandSlug={brandSlug}
      brandWebsite={website}
      homes={homes}
    />
  );
  return (
    <WorkspaceCard title="Non-WanderOS homes" icon={Plus} count={homes.length}>
      {connected ? (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Paste home details
            {homes.length ? ` · ${homes.length} manual homes` : ""}
          </summary>
          <div className="pt-4">{editor}</div>
        </details>
      ) : (
        editor
      )}
    </WorkspaceCard>
  );
}
