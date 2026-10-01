"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Brand = { id: string; name: string };
type Series = {
  id: string;
  brandId: string;
  name: string;
  description: string | null;
  theme: string | null;
};
export function SeriesEditor({
  brands,
  series,
}: {
  brands: Brand[];
  series?: Series;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState(
    series?.brandId ?? brands[0]?.id ?? "",
  );
  const [name, setName] = useState(series?.name ?? "");
  const [description, setDescription] = useState(series?.description ?? "");
  const [theme, setTheme] = useState(series?.theme ?? "");
  const save = useMutation(
    orpc.series.save.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        router.push(result.url);
        router.refresh();
      },
    }),
  );
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setName(series?.name ?? "");
          setDescription(series?.description ?? "");
          setTheme(series?.theme ?? "");
          save.reset();
          setOpen(true);
        }}
      >
        {series ? "Edit series" : "New series"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{series ? "Edit series" : "New series"}</DialogTitle>
          <DialogDescription>
            Define the recurring promise, then add installments and their
            channels.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({
                brandId,
                seriesId: series?.id,
                name: name.trim(),
                description: description.trim() || null,
                theme: theme.trim() || null,
              });
            }}
          >
            <Label>
              Brand
              <select
                className="block w-full rounded-md border bg-background p-2"
                value={brandId}
                disabled={!!series}
                onChange={(e) => setBrandId(e.target.value)}
              >
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Name
              <Input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Label>
            <Label>
              Recurring promise
              <Textarea
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Label>
            <Label>
              Theme
              <Input
                maxLength={500}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
            </Label>
            {save.error && (
              <p role="alert" className="text-sm text-destructive">
                {save.error.message}
              </p>
            )}
            <Button
              type="submit"
              disabled={!brandId || !name.trim() || save.isPending}
            >
              {save.isPending ? "Saving…" : "Save series"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
