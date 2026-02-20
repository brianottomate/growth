"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";

/**
 * FORM EXAMPLES
 *
 * Demonstrates various form patterns with react-hook-form and zod
 */

export function FormExamples() {
  return (
    <div className="space-y-8">
      <BasicFormExample />
      <AdvancedFormExample />
      <ServerActionFormExample />
    </div>
  );
}

// ============================================================
// EXAMPLE 1: Basic Form with Validation
// ============================================================

const basicSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters"),
  email: z.string().email("Invalid email address"),
});

type BasicFormData = z.infer<typeof basicSchema>;

function BasicFormExample() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<BasicFormData>({
    resolver: zodResolver(basicSchema),
    defaultValues: {
      username: "",
      email: "",
    },
  });

  const onSubmit = async (data: BasicFormData) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Form submitted:", data);
    toast.success("Form submitted successfully!");
    reset();
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">1. Basic Form with Validation</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            react-hook-form + zod Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                {...register("username")}
                placeholder="Enter username"
              />
              {errors.username && (
                <p className="text-destructive text-sm">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="Enter email"
              />
              {errors.email && (
                <p className="text-destructive text-sm">
                  {errors.email.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-sm">
            Try submitting with invalid data to see validation errors
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 2: Advanced Form with Complex Validation
// ============================================================

const advancedSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
    age: z.number().min(18, "Must be 18 or older").max(120, "Invalid age"),
    terms: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and conditions",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type AdvancedFormData = z.infer<typeof advancedSchema>;

function AdvancedFormExample() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    reset,
  } = useForm<AdvancedFormData>({
    resolver: zodResolver(advancedSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
      age: 18,
      terms: false,
    },
  });

  const password = watch("password");

  const onSubmit = async (data: AdvancedFormData) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Advanced form submitted:", data);
    toast.success("Account created successfully!");
    reset();
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">
        2. Advanced Form with Complex Rules
      </h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Custom Validation & Cross-field Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...register("password")}
                placeholder="Enter password"
              />
              {errors.password && (
                <p className="text-destructive text-sm">
                  {errors.password.message}
                </p>
              )}
              {password && (
                <div className="space-y-1 text-xs">
                  <p
                    className={
                      password.length >= 8
                        ? "text-green-600"
                        : "text-muted-foreground"
                    }
                  >
                    {password.length >= 8 ? "✓" : "○"} At least 8 characters
                  </p>
                  <p
                    className={
                      /[A-Z]/.test(password)
                        ? "text-green-600"
                        : "text-muted-foreground"
                    }
                  >
                    {/[A-Z]/.test(password) ? "✓" : "○"} One uppercase letter
                  </p>
                  <p
                    className={
                      /[0-9]/.test(password)
                        ? "text-green-600"
                        : "text-muted-foreground"
                    }
                  >
                    {/[0-9]/.test(password) ? "✓" : "○"} One number
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...register("confirmPassword")}
                placeholder="Confirm password"
              />
              {errors.confirmPassword && (
                <p className="text-destructive text-sm">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                {...register("age")}
                placeholder="Enter age"
              />
              {errors.age && (
                <p className="text-destructive text-sm">{errors.age.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="terms"
                type="checkbox"
                {...register("terms")}
                className="rounded"
              />
              <Label htmlFor="terms" className="text-sm font-normal">
                I accept the terms and conditions
              </Label>
            </div>
            {errors.terms && (
              <p className="text-destructive text-sm">{errors.terms.message}</p>
            )}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-sm">
            Demonstrates regex validation, cross-field validation, and real-time
            feedback
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 3: Server Action Integration
// ============================================================

const serverActionSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  content: z.string().min(20, "Content must be at least 20 characters"),
});

type ServerActionFormData = z.infer<typeof serverActionSchema>;

// Simulated server action (unused, keeping for reference)
// In a real app, this would be in a separate file with "use server" at the top
// and imported like: import { simulateServerAction } from "@/server/actions/posts"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function simulateServerAction(data: ServerActionFormData) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Server-side validation
  const validated = serverActionSchema.parse(data);

  // Simulate saving to database
  console.log("Saving to DB:", validated);

  return { success: true, id: Math.random().toString(36) };
}

function ServerActionFormExample() {
  const [serverResponse, setServerResponse] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ServerActionFormData>({
    resolver: zodResolver(serverActionSchema),
    defaultValues: {
      title: "",
      content: "",
    },
  });

  const onSubmit = async (_data: ServerActionFormData) => {
    try {
      // In a real app, this would be a Server Action import
      // const result = await createPost(data);

      // Simulated for demo
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const result = {
        success: true,
        id: Math.random().toString(36).substring(7),
      };

      setServerResponse(`Post created with ID: ${result.id}`);
      toast.success("Post created successfully!");
      reset();

      // Clear success message after 5 seconds
      setTimeout(() => setServerResponse(null), 5000);
    } catch (error) {
      toast.error("Failed to create post");
      console.error(error);
    }
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">3. Server Action Integration</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Form Submission via Server Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {serverResponse && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {serverResponse}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Post Title</Label>
              <Input
                id="title"
                {...register("title")}
                placeholder="Enter post title"
              />
              {errors.title && (
                <p className="text-destructive text-sm">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <textarea
                id="content"
                {...register("content")}
                placeholder="Enter post content"
                className="min-h-[120px] w-full rounded-md border px-3 py-2"
              />
              {errors.content && (
                <p className="text-destructive text-sm">
                  {errors.content.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="mr-2">Creating Post...</span>
                  <span className="animate-spin">⏳</span>
                </>
              ) : (
                "Create Post"
              )}
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-sm">
            Server Actions provide type-safe form submission without API routes
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
