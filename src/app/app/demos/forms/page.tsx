import { FormExamples } from "./form-examples";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * FORMS BEST PRACTICES
 *
 * This demo showcases modern form patterns using:
 * - react-hook-form (form state management)
 * - zod (schema validation)
 * - Server Actions (form submission)
 * - Error handling and validation feedback
 */

export default function FormsDemo() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Forms & Validation Demo</h1>
        <p className="text-muted-foreground">
          Best practices for forms using react-hook-form, zod, and Server
          Actions
        </p>
      </div>

      {/* Pattern Explanation */}
      <Card className="border-primary mb-8">
        <CardHeader>
          <CardTitle>Key Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">🎯 Form Stack:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>
                <strong>react-hook-form</strong> - Performant form state
                management with minimal re-renders
              </li>
              <li>
                <strong>zod</strong> - Type-safe schema validation with
                TypeScript inference
              </li>
              <li>
                <strong>@hookform/resolvers</strong> - Connect zod schemas to
                react-hook-form
              </li>
              <li>
                <strong>Server Actions</strong> - Type-safe form submission
                without API routes
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">✅ Best Practices:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Define zod schema for validation and type inference</li>
              <li>Use zodResolver to connect schema to react-hook-form</li>
              <li>Server-side validation in Server Actions</li>
              <li>Client-side validation for instant feedback</li>
              <li>Proper error handling and display</li>
              <li>Loading states during submission</li>
              <li>Optimistic updates when appropriate</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Form Examples */}
      <FormExamples />

      {/* Code Pattern */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Code Pattern</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Form Setup Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {`// 1. Define Zod Schema
import { z } from "zod";

export const userSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  age: z.number().min(18, "Must be 18 or older"),
});

export type UserFormData = z.infer<typeof userSchema>;

// 2. Create Server Action
"use server";

export async function createUser(data: UserFormData) {
  // Server-side validation
  const validated = userSchema.parse(data);

  // Save to database
  await db.insert(userTable).values(validated);

  revalidatePath("/users");
  return { success: true };
}

// 3. Client Component Form
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

export function UserForm() {
  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      age: 18,
    },
  });

  const onSubmit = async (data: UserFormData) => {
    const result = await createUser(data);
    if (result.success) {
      toast.success("User created!");
      form.reset();
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register("name")} />
      {form.formState.errors.name && (
        <p>{form.formState.errors.name.message}</p>
      )}

      <button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Saving..." : "Save"}
      </button>
    </form>
  );
}`}
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
