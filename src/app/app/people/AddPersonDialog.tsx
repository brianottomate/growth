"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, ImagePlus, Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";

const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024;

type Photo = { base64Data: string; mimeType: string; filename: string };

function fileToPhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1] ?? "";
      resolve({ base64Data, mimeType: file.type, filename: file.name });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function AddPersonDialog({ organizationId }: { organizationId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const createPerson = useMutation(
    trpc.org.createPerson.mutationOptions({
      onSuccess: (res) => {
        setCreated({ email: res.email, tempPassword: res.tempPassword });
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Failed to create person"),
    }),
  );

  function reset() {
    setName("");
    setEmail("");
    setRole("member");
    setPhoto(null);
    setPhotoPreview(null);
    setCreated(null);
    setCopied(false);
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo exceeds 4.5MB");
      return;
    }
    setPhoto(await fileToPhoto(file));
    setPhotoPreview(URL.createObjectURL(file));
  }

  function submit() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    createPerson.mutate({
      organizationId,
      name: name.trim(),
      email: email.trim(),
      role,
      ...(photo ? { photo } : {}),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" />
          Add person
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                Share these credentials with {created.email}. They can sign in
                immediately and change the password later.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/50 space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{created.email}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Temp password</span>
                <div className="flex items-center gap-2">
                  <code className="bg-background rounded border px-2 py-0.5 font-mono text-xs">
                    {created.tempPassword}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => {
                      void navigator.clipboard.writeText(created.tempPassword);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? (
                      <Check className="size-3.5 text-green-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset}>
                Add another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="size-5" />
                Add person
              </DialogTitle>
              <DialogDescription>
                Pre-create a teammate&apos;s account. No email is sent — you get a
                temp password to hand out. Must be a @wander.com address.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    "bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border",
                    "hover:border-primary transition-colors",
                  )}
                >
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoPreview}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImagePlus className="text-muted-foreground size-5" />
                  )}
                </button>
                <div className="text-muted-foreground text-xs">
                  Optional profile photo
                  <br />
                  JPEG / PNG / WebP · ≤4.5MB
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => void handlePhoto(e.target.files?.[0])}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="person-name">Name</Label>
                <Input
                  id="person-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Wander"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="person-email">Email</Label>
                <Input
                  id="person-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@wander.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createPerson.isPending}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={createPerson.isPending}>
                {createPerson.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Create account
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
