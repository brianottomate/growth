"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import {
  SEED_TEMPLATE_GROUPS,
  SEED_TEMPLATES,
  type SeedTemplateId,
} from "@/lib/seed-definition";
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<SeedTemplateId | null>(null);
  const [personaId, setPersonaId] = useState(context.personas[0]?.id ?? "");
  const [emailListId, setEmailListId] = useState(
    context.emailLists[0]?.id ?? "",
  );
  const [steer, setSteer] = useState("");
  const build = useMutation(
    orpc.seed.build.mutationOptions({
      onSuccess: (list) => {
        setOpen(false);
        setTemplate(null);
        toast.success(
          `Built ${list.name}: ${list.memberCount.toLocaleString("en-US")} people`,
        );
        if (list.warning) toast.info(list.warning);
        void queryClient.invalidateQueries({
          queryKey: orpc.seed.deliveries.key(),
        });
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const unavailable = (id: SeedTemplateId) =>
    id === "past_bookers" && !context.hasBookingSite
      ? "Needs a connected WanderOS booking site"
      : id === "email_list" && !context.emailLists.length
        ? "No email lists yet"
        : id === "persona" && !context.personas.length
          ? "Define a persona on Setup first"
          : (id === "destinations" || id === "similar_homes") &&
              !context.hasHomes
            ? "Import or add homes first"
            : null;
  const ready =
    template !== null &&
    !unavailable(template) &&
    (template !== "described" || Boolean(steer.trim()));
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(next) => !build.isPending && setOpen(next)}
      title="New seed list"
      description="Builds straight away. Each Meta ad set can then use it as a seed."
      scrollable
      trigger={
        <Button size="sm" variant={primary ? "default" : "outline"}>
          <UsersRound className="size-3.5" />
          New seed list
        </Button>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={build.isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={!ready}
            loading={build.isPending}
            onClick={() =>
              template &&
              build.mutate({
                brandId: context.brandId,
                template,
                ...(template === "persona" ? { personaId } : {}),
                ...(template === "email_list" ? { emailListId } : {}),
                ...(template === "described" ? { steer } : {}),
              })
            }
          >
            {build.isPending ? "Building…" : "Build list"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {(["guests", "wander"] as const).map((group) => (
          <section key={group} className="space-y-2">
            <div>
              <h3 className="text-sm font-medium">
                {SEED_TEMPLATE_GROUPS[group].label}
              </h3>
              <p className="text-xs text-muted-foreground">
                {SEED_TEMPLATE_GROUPS[group].summary}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {SEED_TEMPLATES.filter((t) => t.group === group).map((t) => {
                const blocked = unavailable(t.id);
                const chosen = template === t.id;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "rounded-lg border p-3",
                      chosen && "border-foreground",
                      blocked && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      disabled={Boolean(blocked) || build.isPending}
                      aria-pressed={chosen}
                      onClick={() => setTemplate(t.id)}
                      className="w-full text-left"
                    >
                      <span className="block text-sm font-medium">
                        {t.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {blocked ?? t.summary}
                      </span>
                    </button>
                    {chosen && t.id === "persona" && (
                      <div className="mt-3">
                        <SimpleSelect
                          value={personaId}
                          onValueChange={setPersonaId}
                          disabled={build.isPending}
                          options={context.personas.map((p) => ({
                            value: p.id,
                            label: p.name,
                          }))}
                        />
                      </div>
                    )}
                    {chosen && t.id === "email_list" && (
                      <div className="mt-3">
                        <SimpleSelect
                          value={emailListId}
                          onValueChange={setEmailListId}
                          disabled={build.isPending}
                          options={context.emailLists.map((l) => ({
                            value: l.id,
                            label: `${l.name} · ${l.memberCount.toLocaleString("en-US")}`,
                          }))}
                        />
                      </div>
                    )}
                    {chosen && t.id === "described" && (
                      <Textarea
                        className="mt-3"
                        aria-label="Who the seed is for"
                        value={steer}
                        disabled={build.isPending}
                        placeholder="Families who searched big mountain homes for summer"
                        onChange={(event) => setSteer(event.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </SimpleDialog>
  );
}
