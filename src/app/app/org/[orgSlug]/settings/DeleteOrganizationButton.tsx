"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

import { useTRPC } from "@/trpc/react";

interface DeleteOrganizationButtonProps {
  orgSlug: string;
}

export function DeleteOrganizationButton({
  orgSlug,
}: DeleteOrganizationButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const router = useRouter();
  const trpc = useTRPC();

  const { data: orgData } = useQuery(
    trpc.org.getBySlug.queryOptions({ slug: orgSlug }),
  );

  const deleteOrganizationMutation = useMutation(
    trpc.org.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Organization deleted successfully");
        setOpen(false);
        router.push("/app/dashboard");
      },
      onError: (error) => {
        console.error("Error deleting organization:", error);
        toast.error("Failed to delete organization. Please try again.");
      },
    }),
  );

  const handleDelete = () => {
    if (!orgData) return;

    if (confirmText !== orgData.organization.name) {
      toast.error("Organization name doesn't match");
      return;
    }

    deleteOrganizationMutation.mutate({
      organizationId: orgData.organization.id,
    });
  };

  if (!orgData) return null;

  const isOwner = orgData.userRole === "owner";

  if (!isOwner) {
    return (
      <div className="text-muted-foreground text-sm">
        Only the organization owner can delete the organization.
      </div>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 className="size-4" />
          Delete Organization
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              This action cannot be undone. This will permanently delete the
              organization and remove all associated data.
            </p>
            <div className="space-y-2">
              <p className="font-medium">
                Please type{" "}
                <span className="font-bold">{orgData.organization.name}</span>{" "}
                to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type organization name"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteOrganizationMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={
              confirmText !== orgData.organization.name ||
              deleteOrganizationMutation.isPending
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteOrganizationMutation.isPending
              ? "Deleting..."
              : "Delete Organization"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
