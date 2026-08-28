// orgId only exists once an org has been created, so its absence means the
// lead is still on the pre-auth business step (CORE-5029).
export function resolveOnboardingSlackHeadline(
  onboardingComplete: boolean | undefined,
  orgId: string | null | undefined,
): string {
  if (onboardingComplete) return `:wander: *New Onboarding Completed*`;
  if (orgId) return `:wander: *New Lead Stuck in Onboarding*`;
  return `:wander: *New Onboarding Started*`;
}
