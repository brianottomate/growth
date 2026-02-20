"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

import { authClient } from "@/server/better-auth/client";
import { useTRPC } from "@/trpc/react";

const createOrganizationSchema = z.object({
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

type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export function CreateOrganizationForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });

  // Generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  };

  const validateSlug = async (slug: string) => {
    try {
      const result = await authClient.organization.checkSlug({ slug });
      if (result.error) {
        return { available: false };
      }
      const available = result.data.status || false;
      return { available };
    } catch (error) {
      console.error("Error validating slug:", error);
      return { available: false };
    }
  };

  const onSubmit = async (data: CreateOrganizationInput) => {
    try {
      setIsSubmitting(true);

      // Validate slug availability
      const validation = await validateSlug(data.slug);
      if (!validation.available) {
        form.setError("slug", {
          type: "custom",
          message: "This slug is already taken",
        });
        return;
      }

      // Create organization using Better Auth
      const result = await authClient.organization.create({
        name: data.name,
        slug: data.slug,
      });

      if (result.error) {
        toast.error(result.error.message ?? "Failed to create organization");
        return;
      }

      // Invalidate organization list query
      void queryClient.invalidateQueries(trpc.org.list.queryOptions());

      toast.success("Organization created successfully!");

      // Redirect to the new organization
      router.push(`/app/org/${data.slug}`);
    } catch (error) {
      console.error("Error creating organization:", error);
      toast.error("Failed to create organization. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
        <CardDescription>
          Choose a name for your organization. You can invite team members and
          customize settings after creation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Acme Inc."
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        // Auto-generate slug if it hasn't been manually edited
                        const currentSlug = form.getValues("slug");
                        if (
                          !currentSlug ||
                          currentSlug === generateSlug(field.value)
                        ) {
                          form.setValue("slug", generateSlug(e.target.value));
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>Your company or team name</FormDescription>
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
                    <Input
                      placeholder="acme-inc"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        // Validate slug as user types
                        if (e.target.value.length >= 3) {
                          void validateSlug(e.target.value);
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    A unique identifier for your organization. This will be used
                    in URLs and must be unique.
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
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Organization"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
