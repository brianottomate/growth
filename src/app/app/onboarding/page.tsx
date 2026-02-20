"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { SearchIcon, Sparkles, Users } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { CheckboxGroupCardsField } from "@/components/ui/checkbox-group-cards-field";
import { Form } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import {
  completeOnboardingSchema,
  type CompleteOnboarding,
} from "@/lib/validators/onboarding";
import { useTRPC } from "@/trpc/react";

// Simple progress indicator
function ProgressIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-8 rounded-full transition-colors ${
            i <= current ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Simplified onboarding flow - demonstrates multi-step pattern with timezone/geo detection
 *
 * Features:
 * - Multi-step form with progress indicator
 * - Automatic timezone detection (Intl.DateTimeFormat API)
 * - Server-side geo detection (Vercel headers in production)
 * - Type-safe with shared Zod schema
 *
 * Customize the steps and fields for your app's needs.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const [step, setStep] = useState(0);

  // Detect browser timezone once on mount (IANA format, e.g., "America/New_York")
  const browserTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  // React Hook Form with Zod validation
  const form = useForm<CompleteOnboarding>({
    resolver: zodResolver(completeOnboardingSchema),
    mode: "onChange",
    defaultValues: {
      onboardingSource: [],
    },
  });

  const completeOnboarding = useMutation(
    trpc.user.completeOnboarding.mutationOptions({
      onSuccess: () => {
        toast.success("Welcome! Let's get started.");
        router.push("/app/dashboard");
      },
      onError: (error) => {
        toast.error(
          error.message || "Failed to complete onboarding. Please try again.",
        );
      },
    }),
  );

  const onSubmit = (data: CompleteOnboarding) => {
    console.log("Submitting onboarding:", {
      ...data,
      timeZone: browserTimeZone,
    });
    // Include browser timezone with the onboarding data
    completeOnboarding.mutate({
      ...data,
      timeZone: browserTimeZone,
    });
  };

  const handleNext = () => {
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <div className="mb-12">
          <ProgressIndicator current={step} total={2} />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="min-h-[400px]">
              {/* STEP 0: Welcome */}
              {step === 0 && (
                <div className="space-y-8">
                  <div className="space-y-4 text-center">
                    <h2 className="text-4xl font-bold">Welcome!</h2>
                    <p className="text-muted-foreground text-xl">
                      Let&apos;s get you set up. This will only take a moment.
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Detected timezone:{" "}
                      <span className="font-mono">{browserTimeZone}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 1: How did you find us? */}
              {step === 1 && (
                <div className="space-y-8">
                  <div className="space-y-2 text-center">
                    <h1 className="text-3xl font-bold">How did you find us?</h1>
                    <p className="text-muted-foreground text-lg">
                      This helps us know what&apos;s working (optional).
                    </p>
                  </div>

                  <CheckboxGroupCardsField
                    name="onboardingSource"
                    control={form.control}
                    options={[
                      {
                        value: "friend",
                        label: "Friend or Colleague",
                        icon: <Users className="h-6 w-6" />,
                      },
                      {
                        value: "social_media",
                        label: "Social media",
                        icon: <Sparkles className="h-6 w-6" />,
                      },
                      {
                        value: "search",
                        label: "Search engine",
                        icon: <SearchIcon className="h-6 w-6" />,
                      },
                      {
                        value: "other",
                        label: "Other",
                        icon: <Sparkles className="h-6 w-6" />,
                      },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between border-t pt-6">
              {step === 0 ? (
                <div />
              ) : (
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
              )}

              <div className="flex gap-2">
                {step === 1 ? (
                  <Button
                    key="submit"
                    type="submit"
                    disabled={completeOnboarding.isPending}
                  >
                    {completeOnboarding.isPending
                      ? "Getting started..."
                      : "Get Started"}
                  </Button>
                ) : (
                  <Button key="next" type="button" onClick={handleNext}>
                    Next
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
