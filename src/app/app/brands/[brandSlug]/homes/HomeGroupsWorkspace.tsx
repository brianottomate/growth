"use client";
import { useState, type ReactNode, type ComponentProps } from "react";
import Link from "next/link";
import { ClientWorkspaceSkeleton } from "@/components/client-workspace-skeleton";
import { ContextHomes } from "@/components/brand/ContextHomes";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  ArrowDown,
  Home as HomeIcon,
  CalendarDays,
  ExternalLink,
  Users,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { ShapeBrandButton } from "@/app/app/performance/clients/[brandSlug]/ShapeBrandButton";
import { PickedHomes } from "@/app/app/performance/clients/[brandSlug]/PickedHomes";

type Home = {
  id: string;
  name: string;
  source: string;
  heroSourceUrl?: string | null;
};
type Group = {
  id: string;
  name: string;
  description: string | null;
  isPrimary: boolean;
  source: "suggested" | "intake" | "custom";
  homeIds: string[];
};
type Target = {
  id: string;
  name: string;
  homeGroupId: string | null;
  homeId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
};
export function HomeGroupsWorkspace({
  brandId,
  brandSlug,
  brandName,
  featuredHomes,
  betweenSections,
  setupHref = `/app/brands/${brandSlug}/setup`,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  setupHref?: string;
  featuredHomes?: ComponentProps<typeof PickedHomes>;
  betweenSections?: ReactNode;
}) {
  const client = useQueryClient();
  const context = useQuery(
    orpc.homeGroups.context.queryOptions({ input: { brandId } }),
  );
  const targets = useQuery(
    orpc.homeGroups.targets.queryOptions({ input: { brandId } }),
  );
  const router = useRouter();
  const [groupEditor, setGroupEditor] = useState<Group | "new" | null>(null);
  const [targetEditor, setTargetEditor] = useState<Target | "new" | null>(null);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: orpc.homeGroups.key() });
  };
  const remove = useMutation(
    orpc.homeGroups.delete.mutationOptions({
      onSuccess: refresh,
      onError: (e) => toast.error(e.message),
    }),
  );
  const makePrimary = useMutation(
    orpc.homeGroups.setPrimary.mutationOptions({
      onSuccess: async () => {
        await refresh();
        router.refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const groupOpen = useMutation(
    orpc.homeGroups.groupOpenHomes.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        toast.success(
          `${result.open.length} open · ${result.booked.length} booked`,
        );
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  if (context.isPending) return <ClientWorkspaceSkeleton />;
  if (context.error) return <p role="alert">{context.error.message}</p>;
  const data = context.data;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <section
        id="home-groups"
        className="scroll-mt-4 space-y-4 rounded-xl border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Layers className="size-4 text-muted-foreground" />
            Home groups{" "}
            <span className="font-normal text-muted-foreground">
              {data.groups.length}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGroupEditor("new")}
            >
              New group
            </Button>
            <ShapeBrandButton
              brandId={brandId}
              brandName={brandName}
              section="home groups"
            />
          </div>
        </div>
        <div className="space-y-4">
          {[...data.groups]
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
            .map((group) =>
              group.isPrimary && featuredHomes ? (
                <div
                  key={group.id}
                  aria-label={group.name}
                  className="min-w-0 space-y-3 rounded-xl border p-4"
                >
                  <PickedHomes
                    {...featuredHomes}
                    title={group.name}
                    label={<GroupLabel group={group} />}
                    embedded
                    groupActions={
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGroupEditor(group)}
                      >
                        Edit group
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div
                  key={group.id}
                  aria-label={group.name}
                  className="min-w-0 space-y-3 rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold [overflow-wrap:anywhere]">
                      {group.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {group.homeIds.length}{" "}
                        {group.homeIds.length === 1 ? "home" : "homes"}
                      </span>
                      <GroupLabel group={group} />
                    </h3>
                    <div className="flex gap-2">
                      {!group.isPrimary && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={
                            makePrimary.isPending &&
                            makePrimary.variables?.groupId === group.id
                          }
                          disabled={makePrimary.isPending}
                          onClick={() =>
                            makePrimary.mutate({ groupId: group.id })
                          }
                        >
                          Make primary
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGroupEditor(group)}
                      >
                        Edit group
                      </Button>
                      {!group.isPrimary && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate({ groupId: group.id })}
                        >
                          Delete group
                        </Button>
                      )}
                    </div>
                  </div>
                  {group.description && (
                    <p className="text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  )}
                  <ol className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                    {group.homeIds.slice(0, 4).map((id) => (
                      <li key={id} className="min-w-0">
                        <HomeSummary
                          home={data.homes.find((h) => h.id === id)}
                        />
                      </li>
                    ))}
                  </ol>
                  {group.homeIds.length > 4 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Show {group.homeIds.length - 4} more homes
                      </summary>
                      <ol className="mt-2 grid grid-cols-1 gap-2 @xl:grid-cols-2">
                        {group.homeIds.slice(4).map((id) => (
                          <li key={id} className="min-w-0">
                            <HomeSummary
                              home={data.homes.find((h) => h.id === id)}
                            />
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {!group.homeIds.length && (
                    <p className="text-sm text-muted-foreground">
                      No homes selected.
                    </p>
                  )}
                </div>
              ),
            )}
        </div>
        {!data.homes.length && (
          <p className="text-sm text-muted-foreground">
            Add homes to the inventory or ask the assistant to add a property.
            Groups support manually maintained homes too.
          </p>
        )}
      </section>
      {betweenSections}
      <section id="booking-targets" className="space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarDays className="size-4 text-muted-foreground" />
            Booking targets{" "}
            <span className="font-normal text-muted-foreground">
              {targets.data?.targets.length ?? 0}
            </span>
          </h2>
          <Button
            size="sm"
            variant="outline"
            disabled={!data.connected}
            onClick={() => setTargetEditor("new")}
          >
            New booking target
          </Button>
        </div>
        {!data.connected && (
          <p className="text-sm">
            <Link className="underline" href={setupHref}>
              Enable and connect WanderOS
            </Link>{" "}
            to use booking targets.
          </p>
        )}
        {targets.error && <p role="alert">{targets.error.message}</p>}
        {targets.data && !targets.data.targets.length && (
          <p className="text-sm text-muted-foreground">
            No booking targets yet.
          </p>
        )}
        {targets.data?.targets.map((target) => (
          <div key={target.id} className="space-y-2 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-medium [overflow-wrap:anywhere]">
                {target.name}
              </h3>
              <Button
                size="sm"
                variant="outline"
                disabled={!data.connected}
                onClick={() => setTargetEditor(target)}
              >
                Edit
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                <HomeIcon className="size-3.5 shrink-0" />
                {target.homeGroupId
                  ? data.groups.find((g) => g.id === target.homeGroupId)?.name
                  : target.homeId
                    ? data.homes.find((h) => h.id === target.homeId)?.name
                    : "All brand homes"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                <CalendarDays className="size-3.5 shrink-0" />
                {target.checkIn
                  ? `${bookingDate(target.checkIn)} – ${bookingDate(target.checkOut)}`
                  : "Guest chooses dates"}
              </span>
              {target.guests && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                  <Users className="size-3.5" />
                  {target.guests} guests
                </span>
              )}
            </div>
            <ContextHomes
              label="Included homes"
              homes={data.homes
                .filter((home) =>
                  target.homeId
                    ? home.id === target.homeId
                    : target.homeGroupId
                      ? data.groups
                          .find((group) => group.id === target.homeGroupId)
                          ?.homeIds.includes(home.id)
                      : true,
                )
                .map((home) => ({
                  id: home.id,
                  name: home.name,
                  imageUrl: home.heroSourceUrl,
                }))}
            />
            <div className="flex flex-wrap items-center gap-3">
              <ShapeBrandButton
                brandId={brandId}
                brandName={brandName}
                section="booking target"
                resource={{ id: target.id, name: target.name }}
              />
              {target.checkIn && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data.connected || groupOpen.isPending}
                  onClick={() => groupOpen.mutate({ targetId: target.id })}
                >
                  {groupOpen.isPending &&
                  groupOpen.variables?.targetId === target.id
                    ? "Checking…"
                    : "Group open homes"}
                </Button>
              )}
              {target.url && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(target.url!)
                      .then(() => toast.success("Booking link copied"))
                      .catch(() => toast.error("Could not copy link"))
                  }
                >
                  Copy link
                </Button>
              )}
              {target.url && (
                <a
                  className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
                  href={target.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open booking page <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
            {target.issue && (
              <p role="alert" className="text-sm">
                {target.issue}
              </p>
            )}
          </div>
        ))}
      </section>
      <Dialog
        open={groupEditor !== null}
        onOpenChange={(open) => {
          if (!open) setGroupEditor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {groupEditor === "new" ? "New home group" : "Edit home group"}
            </DialogTitle>
            <DialogDescription>
              Choose and order homes. Existing approved ads remain unchanged.
            </DialogDescription>
          </DialogHeader>
          {groupEditor && (
            <GroupEditor
              key={groupEditor === "new" ? "new" : groupEditor.id}
              brandId={brandId}
              group={groupEditor === "new" ? undefined : groupEditor}
              homes={data.homes}
              onSaved={async () => {
                setGroupEditor(null);
                await refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={targetEditor !== null}
        onOpenChange={(open) => {
          if (!open) setTargetEditor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetEditor === "new"
                ? "New booking target"
                : "Edit booking target"}
            </DialogTitle>
            <DialogDescription>
              Availability and pricing are checked by the booking site.
            </DialogDescription>
          </DialogHeader>
          {targetEditor && (
            <TargetEditor
              key={targetEditor === "new" ? "new" : targetEditor.id}
              brandId={brandId}
              target={targetEditor === "new" ? undefined : targetEditor}
              groups={data.groups}
              homes={data.homes}
              onSaved={async () => {
                setTargetEditor(null);
                await refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function GroupEditor({
  brandId,
  group,
  homes,
  onSaved,
}: {
  brandId: string;
  group?: Group;
  homes: Home[];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [ids, setIds] = useState(group?.homeIds ?? []);
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const orderedHomes = [
    ...ids
      .map((id) => homes.find((home) => home.id === id))
      .filter((home): home is Home => Boolean(home)),
    ...homes.filter((home) => !ids.includes(home.id)),
  ];
  const visibleHomes = orderedHomes.filter((home) =>
    home.name.toLocaleLowerCase().includes(query),
  );
  const save = useMutation({
    mutationFn: async () => {
      const result = await orpc.homeGroups.save.call({
        brandId,
        groupId: group?.id,
        name,
        description,
      });
      await orpc.homeGroups.changeHomes.call({
        groupId: result.groupId,
        homeIds: ids,
        operation: "replace",
      });
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(e.message),
  });
  const move = (index: number, offset: number) => {
    const next = [...ids];
    const destination = index + offset;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setIds(next);
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="group-name">Name</Label>
        <Input
          id="group-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="group-description">Selling angle or description</Label>
        <Input
          id="group-description"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="group-home-search">Find homes</Label>
        <Input
          id="group-home-search"
          type="search"
          placeholder="Search home names…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <p className="text-xs text-muted-foreground" role="status">
          {visibleHomes.length} of {homes.length} homes · {ids.length} selected
        </p>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {visibleHomes.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {homes.length
              ? "No homes match your search."
              : "No homes in the inventory yet."}
          </p>
        )}
        {visibleHomes.map((home) => {
          const index = ids.indexOf(home.id);
          return (
            <div key={home.id} className="flex items-center gap-2">
              <Checkbox
                id={`member-${home.id}`}
                checked={index >= 0}
                onCheckedChange={(checked) =>
                  setIds(
                    checked
                      ? [...ids, home.id]
                      : ids.filter((id) => id !== home.id),
                  )
                }
              />
              <Label className="min-w-0 flex-1" htmlFor={`member-${home.id}`}>
                <HomeSummary home={home} />
              </Label>
              {index >= 0 && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${home.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${home.name} down`}
                    disabled={index === ids.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {save.error && (
        <p role="alert" className="text-sm">
          {save.error.message}
        </p>
      )}
      <Button
        disabled={!name.trim() || save.isPending}
        onClick={() => save.mutate()}
      >
        Save group
      </Button>
    </div>
  );
}
function TargetEditor({
  brandId,
  target,
  groups,
  homes,
  onSaved,
}: {
  brandId: string;
  target?: Target;
  groups: Group[];
  homes: Home[];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(target?.name ?? "");
  const [selection, setSelection] = useState(
    target?.homeGroupId
      ? `group:${target.homeGroupId}`
      : target?.homeId
        ? `home:${target.homeId}`
        : "all",
  );
  const [checkIn, setCheckIn] = useState(target?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(target?.checkOut ?? "");
  const [guests, setGuests] = useState(target?.guests?.toString() ?? "");
  const save = useMutation(
    orpc.homeGroups.saveTarget.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="target-name">Name</Label>
        <Input
          id="target-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="target-selection">Homes</Label>
        <Select value={selection} onValueChange={setSelection}>
          <SelectTrigger id="target-selection">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brand homes</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={`group:${g.id}`}>
                {g.name}
              </SelectItem>
            ))}
            {homes
              .filter((h) => h.source === "wanderos")
              .map((h) => (
                <SelectItem key={h.id} value={`home:${h.id}`}>
                  {h.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="target-checkin">Check-in (optional)</Label>
          <Input
            id="target-checkin"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-checkout">Check-out (optional)</Label>
          <Input
            id="target-checkout"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="target-guests">Guests (optional)</Label>
        <Input
          id="target-guests"
          type="number"
          min={1}
          max={100}
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
        />
      </div>
      {save.error && (
        <p role="alert" className="text-sm">
          {save.error.message}
        </p>
      )}
      <Button
        disabled={!name.trim() || save.isPending}
        onClick={() =>
          save.mutate({
            brandId,
            targetId: target?.id,
            name,
            homeGroupId: selection.startsWith("group:")
              ? selection.slice(6)
              : null,
            homeId: selection.startsWith("home:") ? selection.slice(5) : null,
            checkIn: checkIn || null,
            checkOut: checkOut || null,
            guests: guests ? Number(guests) : null,
          })
        }
      >
        Save booking target
      </Button>
    </div>
  );
}

function bookingDate(value: string | null) {
  if (!value) return "Choose checkout";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
function HomeSummary({ home }: { home?: Home }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-2.5 rounded-lg bg-muted/40 p-1.5">
      {home?.heroSourceUrl && !failed ? (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={home.heroSourceUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-12 w-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <HomeIcon className="size-5" />
        </span>
      )}
      <span className="min-w-0 text-xs leading-snug font-medium [overflow-wrap:anywhere]">
        {home?.name ?? "Home unavailable"}
      </span>
    </span>
  );
}

const SOURCE_LABEL: Record<Group["source"], string> = {
  suggested: "Suggested",
  intake: "From client",
  custom: "Custom",
};

function GroupLabel({ group }: { group: Group }) {
  return (
    <span className="ml-2 inline-flex gap-1 align-middle text-xs font-normal">
      {group.isPrimary && (
        <span className="rounded-full bg-foreground px-2 py-0.5 text-background">
          Primary
        </span>
      )}
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        {SOURCE_LABEL[group.source]}
      </span>
    </span>
  );
}
