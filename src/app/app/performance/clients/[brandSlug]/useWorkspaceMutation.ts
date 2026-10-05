"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";

/** Keep card actions busy until the refreshed server content is visible.
 * Caller callbacks still own query invalidation, editor state and result messages.
 * Background jobs must keep tracking their job after this request completes.
 */
export function useWorkspaceMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(options: UseMutationOptions<TData, TError, TVariables, TContext>) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const mutation = useMutation({
    ...options,
    onSuccess: async (...args) => {
      await options.onSuccess?.(...args);
      startTransition(() => router.refresh());
    },
    onError:
      options.onError ??
      ((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to save. Please try again.",
        );
      }),
  });
  return { ...mutation, isPending: mutation.isPending || refreshing };
}
