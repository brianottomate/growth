"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

import { useTRPC } from "@/trpc/react";

const updateOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(100),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    ),
});

type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

interface GeneralInfoFormProps {
  orgSlug: string;
}

export function GeneralInfoForm({ orgSlug }: GeneralInfoFormProps) {
  const router = useRouter();
  const trpc = useTRPC();

  const { data: orgData, isLoading } = useQuery(
    trpc.org.getBySlug.queryOptions({ slug: orgSlug }),
  );

  const form = useForm<UpdateOrgInput>({
    resolver: zodResolver(updateOrgSchema),
    values: {
      name: orgData?.organization.name ?? "",
      slug: orgData?.organization.slug ?? "",
    },
  });

  const updateOrganizationMutation = useMutation(
    trpc.org.update.mutationOptions({
      onSuccess: (_, variables) => {
        toast.success("Organization updated successfully!");

        // If slug changed, redirect to new URL
        if (variables.slug !== orgSlug) {
          router.push(`/app/org/${variables.slug}/settings`);
        }
      },
      onError: (error) => {
        console.error("Error updating organization:", error);
        toast.error("Failed to update organization. Please try again.");
      },
    }),
  );

  const onSubmit = (data: UpdateOrgInput) => {
    if (!orgData) return;

    updateOrganizationMutation.mutate({
      organizationId: orgData.organization.id,
      name: data.name,
      slug: data.slug,
    });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Inc." {...field} />
              </FormControl>
              <FormDescription>
                The display name for your organization
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Slug</FormLabel>
              <FormControl>
                <Input placeholder="acme-inc" {...field} />
              </FormControl>
              <FormDescription>
                A unique identifier used in URLs. Changing this will update all
                organization links.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={updateOrganizationMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateOrganizationMutation.isPending}>
            {updateOrganizationMutation.isPending
              ? "Saving..."
              : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
