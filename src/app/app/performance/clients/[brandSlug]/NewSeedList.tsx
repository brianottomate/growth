"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { StartFromDialog } from "@/components/start-from-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { SEED_TEMPLATES, type SeedTemplateId } from "@/lib/seed-definition";
import { orpc } from "@/orpc/client";

export type NewSeedListContext = {
  brandId: string;
  /** A WanderOS booking site, needed for the brand's own bookers. */
  hasBookingSite: boolean;
  hasHomes: boolean;
  personas: { id: string; name: string }[];
  emailLists: { id: string; name: string; memberCount: number }[];
};

/** "New seed list": pick a starting point and build it in one click. */
export function NewSeedList({
  context,
  primary = false,
}: {
  context: NewSeedListContext;
  primary?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<SeedTemplateId>(
    context.hasBookingSite ? "past_bookers" : "destinations",
  );
  const [personaId, setPersonaId] = useState(context.personas[0]?.id ?? "");
  const [emailListId, setEmailListId] = useState(
    context.emailLists[0]?.id ?? "",
  );
  const [steer, setSteer] = useState("");
  const build = useMutation(
    orpc.seed.build.mutationOptions({
      onSuccess: ({ list, snapshot }) => {
        setOpen(false);
        toast.success(
          `Built ${list.name}: ${snapshot.memberCount.toLocaleString("en-US")} people`,
        );
        if (snapshot.warning) toast.info(snapshot.warning);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const unavailable = (id: SeedTemplateId) =>
    id === "past_bookers" && !context.hasBookingSite
      ? "Needs a connected WanderOS booking site."
      : id === "email_list" && !context.emailLists.length
        ? "This brand has no email lists yet."
        : id === "persona" && !context.personas.length
          ? "Define a persona on Setup first."
          : (id === "destinations" || id === "similar_homes") &&
              !context.hasHomes
            ? "Import or add homes first."
            : undefined;
  const select = "w-full rounded-md border bg-background p-2 text-sm";
  return (
    <StartFromDialog
      open={open}
      onOpenChange={setOpen}
      trigger={{
        label: "New seed list",
        primary,
        icon: <UsersRound className="size-3.5" />,
      }}
      title="New seed list"
      intro={
        <p className="text-sm text-muted-foreground">
          Builds straight away. Each Meta ad set can then use it as a seed.
        </p>
      }
      options={SEED_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        category: t.category,
        summary: t.summary,
        unavailable: unavailable(t.id),
      }))}
      value={template}
      onValueChange={setTemplate}
      submitLabel="Build list"
      busyLabel="Building list"
      busy={build.isPending}
      canSubmit={template !== "described" || Boolean(steer.trim())}
      onSubmit={() =>
        build.mutate({
          brandId: context.brandId,
          template,
          ...(template === "persona" ? { personaId } : {}),
          ...(template === "email_list" ? { emailListId } : {}),
          ...(template === "described" ? { steer } : {}),
        })
      }
    >
      {template === "persona" && (
        <div className="space-y-1">
          <Label htmlFor="seed-persona">Persona</Label>
          <select
            id="seed-persona"
            className={select}
            value={personaId}
            disabled={build.isPending}
            onChange={(event) => setPersonaId(event.target.value)}
          >
            {context.personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {template === "email_list" && (
        <div className="space-y-1">
          <Label htmlFor="seed-email-list">Email list</Label>
          <select
            id="seed-email-list"
            className={select}
            value={emailListId}
            disabled={build.isPending}
            onChange={(event) => setEmailListId(event.target.value)}
          >
            {context.emailLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} · {list.memberCount.toLocaleString("en-US")}
              </option>
            ))}
          </select>
        </div>
      )}
      {template === "described" && (
        <div className="space-y-1">
          <Label htmlFor="seed-steer">Who it is for</Label>
          <Textarea
            id="seed-steer"
            value={steer}
            disabled={build.isPending}
            placeholder="Families who searched big mountain homes for summer"
            onChange={(event) => setSteer(event.target.value)}
          />
        </div>
      )}
    </StartFromDialog>
  );
}
