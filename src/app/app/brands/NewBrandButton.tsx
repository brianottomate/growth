"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTRPC } from "@/trpc/react";

const TYPES = [
  { value: "company", label: "Company" },
  { value: "personal", label: "Personal" },
];

export function NewBrandButton() {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandType, setBrandType] = useState("company");
  const [website, setWebsite] = useState("");

  const createM = useMutation(
    trpc.brand.create.mutationOptions({
      onSuccess: (brand) => {
        setOpen(false);
        setName("");
        setWebsite("");
        setBrandType("company");
        // Land on the brand page: the next step (send the connect link,
        // review channels) lives there, not on the list.
        if (brand?.slug) {
          router.push(`/app/brands/${brand.slug}`);
        } else {
          router.refresh();
        }
      },
    }),
  );

  const save = () =>
    createM.mutate({
      name,
      scope: "owned",
      brandType: brandType as never,
      website: website || undefined,
    });

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        New brand
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New brand</DialogTitle>
            <DialogDescription>
              Create an owned company or personal brand in Wander Growth.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Website first: it is the highest-leverage input (enrichment
                fills the rest from it in the background after create). */}
            <div className="flex flex-col gap-1.5">
              <Label>Website</Label>
              <Input
                autoFocus
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="example.com"
              />
              <p className="text-muted-foreground text-xs">
                Optional — details auto-fill from the site after create.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wander"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={brandType} onValueChange={setBrandType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={createM.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              loading={createM.isPending}
              disabled={!name.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
