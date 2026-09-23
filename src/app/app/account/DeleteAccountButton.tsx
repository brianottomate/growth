"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { orpc } from "@/orpc/client";
import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/server/better-auth/client";

interface DeleteAccountButtonProps {
  userId: string;
}

export function DeleteAccountButton({
  userId: _userId,
}: DeleteAccountButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteAccount = useMutation(
    orpc.user.delete.mutationOptions({
      onSuccess: async () => {
        // Sign out after successful deletion
        await authClient.signOut();
        router.push("/");
        router.refresh();
      },
    }),
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount.mutateAsync();
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isDeleting}>
          Delete Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove all your data including:
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              <li>Your profile information</li>
              <li>All Tinder and Hinge profiles</li>
              <li>All matches and messages</li>
              <li>All media and statistics</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            tone="destructive"
          >
            {isDeleting ? "Deleting..." : "Yes, delete my account"}
          </AlertDialogAction>
        </AlertDialogFooter>
        {deleteAccount.isError && (
          <p className="text-sm text-destructive">
            Error: {deleteAccount.error.message}
          </p>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
