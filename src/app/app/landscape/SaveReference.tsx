"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
export function SaveReference({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [boardId, setBoardId] = useState("");
  const [note, setNote] = useState("");
  const query = useQuery(
    orpc.referenceBoard.list.queryOptions({ input: {}, enabled: open }),
  );
  const client = useQueryClient();
  const save = useMutation(
    orpc.referenceBoard.addReference.mutationOptions({
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: orpc.referenceBoard.key() });
        setOpen(false);
        setNote("");
        toast.success("Reference saved to board");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          Save to board
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save reference</DialogTitle>
          <DialogDescription>
            Keep the source and a note about what you want to explore.
          </DialogDescription>
        </DialogHeader>
        {query.error && <p role="alert">{query.error.message}</p>}
        <label className="space-y-1 text-sm">
          Board
          <SimpleSelect
            value={boardId}
            onValueChange={setBoardId}
            placeholder="Choose a board"
            options={(query.data?.boards ?? [])
              .filter((b) => !b.archived)
              .map((b) => ({
                value: b.id,
                label: `${b.name} · ${b.brandName}`,
              }))}
          />
        </label>
        <label className="space-y-1 text-sm">
          What stands out?
          <Textarea
            maxLength={5000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button
          disabled={!boardId || save.isPending}
          onClick={() =>
            save.mutate({ boardId, source: { kind: "post", id: postId }, note })
          }
        >
          Save reference
        </Button>
        <Button asChild variant="ghost">
          <Link href="/app/landscape/boards" target="_blank">
            Create or open boards
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
