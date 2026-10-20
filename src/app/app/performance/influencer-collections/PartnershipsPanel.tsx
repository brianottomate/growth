"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { orpc, type RouterOutputs } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { SimpleSelect } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";

type Partnership = RouterOutputs["influencerPartnerships"]["list"][number];
type Draft = {
  id?: string;
  amplifierId: string;
  brandId: string;
  homeId: string;
  checkIn: string;
  checkOut: string;
  deliverables: string;
  notes: string;
};
const blank = (): Draft => ({
  amplifierId: "",
  brandId: "",
  homeId: "",
  checkIn: "",
  checkOut: "",
  deliverables: "",
  notes: "",
});

export function PartnershipsPanel({
  orgId,
  clients,
  homes,
  contacts,
  createOpen,
  onCreateOpenChange,
}: {
  orgId: string;
  clients: RouterOutputs["homeGroupShares"]["clients"];
  homes: RouterOutputs["homeGroupShares"]["homes"];
  contacts: RouterOutputs["amplifier"]["list"]["amplifiers"];
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const key = [
    ...orpc.influencerPartnerships.list.queryKey({ input: {} }),
    { orgId },
  ];
  const list = useQuery({
    ...orpc.influencerPartnerships.list.queryOptions({
      input: {},
      queryKey: key,
    }),
  });
  const [editing, setEditing] = useState<Partnership | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Partnership | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const open = createOpen || editing !== null;
  useEffect(() => {
    if (!open) return;
    setError("");
    setDraft(
      editing
        ? {
            id: editing.id,
            amplifierId: editing.amplifierId,
            brandId: editing.brandId,
            homeId: editing.homeId ?? "",
            checkIn: editing.checkIn ?? "",
            checkOut: editing.checkOut ?? "",
            deliverables: editing.deliverables ?? "",
            notes: editing.notes ?? "",
          }
        : blank(),
    );
  }, [open, editing]);
  const close = () => {
    onCreateOpenChange(false);
    setEditing(null);
  };
  const save = useMutation(
    orpc.influencerPartnerships.save.mutationOptions({
      onSuccess: async () => {
        close();
        await queryClient.invalidateQueries({ queryKey: key });
        toast.success("Partnership saved");
      },
      onError: (failure) => setError(failure.message),
    }),
  );
  const remove = useMutation(
    orpc.influencerPartnerships.remove.mutationOptions({
      onSuccess: async () => {
        setDeleting(null);
        await queryClient.invalidateQueries({ queryKey: key });
        toast.success("Partnership deleted");
      },
      onError: (failure) => setError(failure.message),
    }),
  );
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tracking link copied");
    } catch {
      setCopyFallback(url);
    }
  }
  const datesValid =
    (!draft.checkIn && !draft.checkOut) ||
    (!!draft.checkIn && !!draft.checkOut && draft.checkOut > draft.checkIn);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Heading as="h2" variant="headline">
          Partnerships
        </Heading>
        <Text color="secondary">
          Give each collaboration a booking link for its brief. Reusable
          collections help creators browse; partnership links attribute the
          promotion to one collaboration.
        </Text>
      </div>
      {list.isPending && <Text role="status">Loading partnerships…</Text>}
      {list.isError && (
        <div role="alert">
          <Text>We couldn’t load partnerships.</Text>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {list.data?.length === 0 && (
        <div className="space-y-4 rounded-xl border border-dashed border-border p-8 text-center">
          <Text>
            Create a partnership to generate a tagged link for one creator and
            client.
          </Text>
          <Button onClick={() => onCreateOpenChange(true)}>
            <Plus className="size-4" /> New partnership
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-2">
        {list.data?.map((partnership) => (
          <article
            key={partnership.id}
            className="min-w-0 space-y-4 rounded-xl border border-border p-5"
          >
            <div className="space-y-1">
              <Heading as="h3" variant="headline-sm">
                {partnership.amplifierName}
              </Heading>
              <Text color="secondary">
                {partnership.brandName} ·{" "}
                {partnership.homeName ?? "Client booking site"}
              </Text>
            </div>
            {(partnership.checkIn || partnership.checkOut) && (
              <Text color="secondary">
                Stay: {partnership.checkIn} → {partnership.checkOut}
              </Text>
            )}
            {partnership.deliverables && (
              <Text className="break-words whitespace-pre-wrap">
                {partnership.deliverables}
              </Text>
            )}
            {partnership.trackingUrl ? (
              <div className="space-y-2">
                <Label htmlFor={`link-${partnership.id}`}>Tracking link</Label>
                <Input
                  id={`link-${partnership.id}`}
                  readOnly
                  value={partnership.trackingUrl}
                  onFocus={(event) => event.target.select()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void copy(partnership.trackingUrl!)}
                  >
                    <Copy className="size-4" /> Copy tracking link
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={partnership.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" /> Open destination
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <Text role="status" color="secondary">
                {partnership.linkIssue}
              </Text>
            )}
            {partnership.notes && (
              <Text
                color="secondary"
                className="break-words whitespace-pre-wrap"
              >
                {partnership.notes}
              </Text>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(partnership)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError("");
                  setDeleting(partnership);
                }}
              >
                <Trash2 className="size-4" /> Delete partnership
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value && !save.isPending) close();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit partnership" : "New partnership"}
            </DialogTitle>
            <DialogDescription>
              Choose an amplifier and a client. Add a home to promote one
              property, or leave it empty to promote the client’s booking site.
              Stay dates are internal context.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !draft.amplifierId ||
                !draft.brandId ||
                !datesValid ||
                save.isPending
              )
                return;
              save.mutate({
                ...draft,
                homeId: draft.homeId || null,
                checkIn: draft.checkIn || null,
                checkOut: draft.checkOut || null,
                deliverables: draft.deliverables || null,
                notes: draft.notes || null,
              });
            }}
          >
            <fieldset disabled={save.isPending} className="space-y-4">
              <div className="space-y-2">
                <Label>Amplifier</Label>
                <SimpleSelect
                  aria-label="Partnership amplifier"
                  value={draft.amplifierId}
                  onValueChange={(amplifierId) =>
                    setDraft({ ...draft, amplifierId })
                  }
                  placeholder="Choose an amplifier"
                  options={contacts.map((contact) => ({
                    value: contact.id,
                    label: contact.name,
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <SimpleSelect
                  aria-label="Partnership client"
                  value={draft.brandId}
                  onValueChange={(brandId) =>
                    setDraft({ ...draft, brandId, homeId: "" })
                  }
                  placeholder="Choose a client"
                  options={clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Home (optional)</Label>
                <SimpleSelect
                  aria-label="Partnership home"
                  disabled={!draft.brandId}
                  value={draft.homeId || "portfolio"}
                  onValueChange={(homeId) =>
                    setDraft({
                      ...draft,
                      homeId: homeId === "portfolio" ? "" : homeId,
                    })
                  }
                  options={[
                    { value: "portfolio", label: "Client booking site" },
                    ...homes
                      .filter((home) => home.brandId === draft.brandId)
                      .map((home) => ({ value: home.id, label: home.name })),
                  ]}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="partnership-check-in">
                    Check-in (optional)
                  </Label>
                  <Input
                    id="partnership-check-in"
                    type="date"
                    value={draft.checkIn}
                    onChange={(event) =>
                      setDraft({ ...draft, checkIn: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partnership-check-out">
                    Check-out (optional)
                  </Label>
                  <Input
                    id="partnership-check-out"
                    type="date"
                    value={draft.checkOut}
                    onChange={(event) =>
                      setDraft({ ...draft, checkOut: event.target.value })
                    }
                  />
                </div>
              </div>
              {!datesValid && (
                <Text role="alert">
                  Provide both dates, with check-out after check-in.
                </Text>
              )}
              <div className="space-y-2">
                <Label htmlFor="partnership-deliverables">
                  Deliverables (optional)
                </Label>
                <Textarea
                  id="partnership-deliverables"
                  maxLength={4000}
                  value={draft.deliverables}
                  onChange={(event) =>
                    setDraft({ ...draft, deliverables: event.target.value })
                  }
                  placeholder="Stories, one Reel, usage rights…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partnership-notes">
                  Internal notes (optional)
                </Label>
                <Textarea
                  id="partnership-notes"
                  maxLength={4000}
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                />
              </div>
              {error && <Text role="alert">{error}</Text>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    save.isPending ||
                    !draft.amplifierId ||
                    !draft.brandId ||
                    !datesValid
                  }
                >
                  {save.isPending ? "Saving…" : "Save partnership"}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(value) => {
          if (!value && !remove.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this partnership?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the partnership from the active list and keeps its
              attribution history. Already copied tagged links still open the
              booking site. Contacts and homes are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <Text role="alert">{error}</Text>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove.mutate({ id: deleting.id });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete partnership"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={copyFallback !== null}
        onOpenChange={(value) => {
          if (!value) setCopyFallback(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy tracking link</DialogTitle>
            <DialogDescription>
              Select and copy the link below.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Tracking link"
            readOnly
            value={copyFallback ?? ""}
            onFocus={(event) => event.target.select()}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
