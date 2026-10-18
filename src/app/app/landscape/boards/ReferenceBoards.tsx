"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

export function ReferenceBoards() {
  const query = useQuery(orpc.referenceBoard.list.queryOptions({ input: {} }));
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [archived, setArchived] = useState(false);
  const router = useRouter();
  const client = useQueryClient();
  const save = useMutation(
    orpc.referenceBoard.save.mutationOptions({
      onSuccess: async (result) => {
        await client.invalidateQueries({ queryKey: orpc.referenceBoard.key() });
        router.push(`/app/landscape/boards/${result.board.id}`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 @xl:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reference boards</h1>
          <p className="text-sm text-muted-foreground">
            Collect references for a brand, shape proposals and bring a chosen
            idea into production.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/landscape">Browse Landscape</Link>
        </Button>
      </header>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ name, brandId, brief: "", archived: false });
        }}
      >
        <label className="min-w-48 flex-1 space-y-1 text-sm">
          Board name
          <Input
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Autumn creative directions"
          />
        </label>
        <label className="min-w-48 space-y-1 text-sm">
          Brand
          <SimpleSelect
            value={brandId}
            onValueChange={setBrandId}
            placeholder="Choose a brand"
            options={(query.data?.brands ?? []).map((b) => ({
              value: b.id,
              label: b.name,
            }))}
          />
        </label>
        <Button
          type="submit"
          disabled={!brandId || !name.trim() || save.isPending}
        >
          Create board
        </Button>
      </form>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        Include archived boards
      </label>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && (
        <p className="text-muted-foreground">Loading boards…</p>
      )}
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
        {query.data?.boards
          .filter((b) => archived || !b.archived)
          .map((board) => (
            <Link
              key={board.id}
              href={`/app/landscape/boards/${board.id}`}
              className="space-y-2 rounded-xl border bg-card p-5 hover:bg-accent"
            >
              <p className="text-xs text-muted-foreground">
                {board.brandName}
                {board.archived ? " · Archived" : ""}
              </p>
              <h2 className="text-lg font-medium">{board.name}</h2>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {board.brief || "Add references and a brief to get started."}
              </p>
            </Link>
          ))}
      </div>
      {query.data &&
        !query.data.boards.some((b) => archived || !b.archived) && (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Create a board, then save posts from Landscape or choose media from
            the brand library.
          </p>
        )}
    </div>
  );
}
