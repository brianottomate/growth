"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";

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
import { useTRPC } from "@/trpc/react";
import { PhotoPickerField, usePhotoPicker } from "./PhotoPicker";

export function AddPersonDialog({
  organizationId,
}: {
  organizationId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const photoPicker = usePhotoPicker();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [created, setCreated] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const createPerson = useMutation(
    trpc.org.createPerson.mutationOptions({
      onSuccess: (res) => {
        setCreated({ email: res.email, tempPassword: res.tempPassword });
        if (res.photoRequested && !res.photoSet) {
          toast.error(
            "Account created, but the photo couldn't be saved (check the image URL).",
          );
        }
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Failed to create person"),
    }),
  );

  function reset() {
    setName("");
    setEmail("");
    setRole("member");
    photoPicker.reset();
    setCreated(null);
    setCopied(false);
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
      ...photoPicker.payload,
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
      <DialogContent
        className="sm:max-w-[440px]"
        onPaste={photoPicker.handlePaste}
      >
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                Share these credentials with {created.email}. They can sign in
                immediately and change the password later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border bg-muted/50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{created.email}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Temp password</span>
                <div className="flex items-center gap-2">
                  <code className="rounded border bg-background px-2 py-0.5 font-mono text-xs">
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
                Pre-create a teammate&apos;s account. No email is sent — you get
                a temp password to hand out. Must be a @wander.com address.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <PhotoPickerField picker={photoPicker} />

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
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as typeof role)}
                >
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
