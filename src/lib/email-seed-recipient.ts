export const BROADCAST_SEED_RECIPIENTS = ["thisisbriansun@gmail.com"] as const;

const allowed = new Set<string>(BROADCAST_SEED_RECIPIENTS);

export function isBroadcastSeedRecipient(email: string) {
  return allowed.has(email.trim().toLowerCase());
}
