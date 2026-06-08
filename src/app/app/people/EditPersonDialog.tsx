"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2, Pencil } from "lucide-react";

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
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";
import { PhotoPickerField, usePhotoPicker } from "./PhotoPicker";

type OrgRole = "owner" | "admin" | "member";

export type EditableMember = {
  id: string;
  userId: string;
  role: OrgRole;
  name: string | null;
  email: string | null;
  image: string | null;
};

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

export function EditPersonDialog({
  member,
  isSelf,
  open,
  onOpenChange,
  onSaved,
}: {
  member: EditableMember | null;
  isSelf: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const trpc = useTRPC();
  const photoPicker = usePhotoPicker(member?.image ?? null);
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState<OrgRole>(member?.role ?? "member");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Re-seed the form whenever a different member is opened. photoPicker is
  // intentionally omitted — re-seed only on member/open change.
  useEffect(() => {
    if (member) {
      setName(member.name ?? "");
      setRole(member.role);
      setNewPassword(null);
      setCopied(false);
      photoPicker.reset();
    }
  }, [member?.id, open]);

  const resetPassword = useMutation(
    trpc.org.resetPassword.mutationOptions({
      onSuccess: (res) => {
        setNewPassword(res.tempPassword);
        setCopied(false);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const updatePerson = useMutation(
    trpc.org.updatePerson.mutationOptions({
      onSuccess: () => {
        toast.success("Saved");
        onOpenChange(false);
        onSaved();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (!member) return null;

  function submit() {
    if (!member) return;
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    updatePerson.mutate({
      memberId: member.id,
      name: name.trim(),
      ...(isSelf ? {} : { role }),
      ...photoPicker.payload,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[440px]"
        onPaste={photoPicker.handlePaste}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            Edit person
          </DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PhotoPickerField picker={photoPicker} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Wander"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <SimpleSelect
              value={role}
              onValueChange={(v) => setRole(v as OrgRole)}
              options={ROLE_OPTIONS}
              disabled={isSelf}
              aria-label="Role"
            />
            {isSelf && (
              <p className="text-muted-foreground text-xs">
                You can&apos;t change your own role.
              </p>
            )}
          </div>

          <div className="space-y-2 border-t pt-3">
            {newPassword ? (
              <div className="bg-muted/50 flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <div className="text-muted-foreground text-xs">
                    New temp password — share it once
                  </div>
                  <code className="bg-background mt-1 inline-block rounded border px-2 py-0.5 font-mono text-xs">
                    {newPassword}
                  </code>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  onClick={() => {
                    void navigator.clipboard.writeText(newPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  aria-label="Copy password"
                >
                  {copied ? (
                    <Check className="size-3.5 text-green-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={resetPassword.isPending}
                onClick={() =>
                  resetPassword.mutate({ memberId: member.id })
                }
              >
                {resetPassword.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Reset password
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updatePerson.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={updatePerson.isPending}>
            {updatePerson.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
