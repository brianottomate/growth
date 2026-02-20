import { z } from "zod";

// Simplified onboarding schema - demonstrates multi-step pattern with timezone/geo detection
// Customize this for your app's specific needs

export const completeOnboardingSchema = z.object({
  // How the user found the app (optional, multi-select)
  onboardingSource: z.array(z.string()).optional(),
  // Client-side detected timezone (IANA format, e.g., "America/New_York")
  // Detected via Intl.DateTimeFormat().resolvedOptions().timeZone
  timeZone: z.string().optional(),
});

export type CompleteOnboarding = z.infer<typeof completeOnboardingSchema>;
