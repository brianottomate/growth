/**
 * Auth utility functions for email provider detection and callback URL handling
 * Ported from Homi's implementation
 */

export const DEFAULT_PASSWORD_RESET_REDIRECT = "/reset-password";

/**
 * Email provider configurations for sniper links (direct inbox access)
 */
const EMAIL_PROVIDERS = {
  gmail: {
    domains: ["gmail.com", "googlemail.com"],
    url: "https://mail.google.com/mail/u/0/#inbox",
  },
  outlook: {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    url: "https://outlook.live.com/mail/0/inbox",
  },
  yahoo: {
    domains: ["yahoo.com", "yahoo.co.uk", "yahoo.ca"],
    url: "https://mail.yahoo.com/d/folders/1",
  },
  icloud: {
    domains: ["icloud.com", "me.com", "mac.com"],
    url: "https://www.icloud.com/mail",
  },
};

/**
 * Detects email provider from email address and returns appropriate inbox URL
 */
export function getEmailInboxUrl(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) {
    return `mailto:${email}`;
  }

  for (const provider of Object.values(EMAIL_PROVIDERS)) {
    if (provider.domains.includes(domain)) {
      return provider.url;
    }
  }

  // Default to Gmail for unknown providers (better UX than broken link)
  return "https://mail.google.com/mail/u/0/#inbox";
}

/**
 * Gets a user-friendly provider name from email address
 */
export function getEmailProviderName(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) {
    return "Inbox";
  }

  for (const [providerKey, provider] of Object.entries(EMAIL_PROVIDERS)) {
    if (provider.domains.includes(domain)) {
      return providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
    }
  }

  // Default to "Inbox" for unknown providers (generic label)
  return "Inbox";
}

/**
 * Determines the callback URL based on context (invites, new signup, etc.)
 * @param searchParams - URL search parameters
 * @param options - Additional options for callback URL construction
 * @returns The appropriate callback URL
 */
export function getCallbackURL(
  searchParams: URLSearchParams,
  options?: {
    includeEmail?: string;
    includeEmailParam?: boolean;
    isNewSignup?: boolean;
  },
): string {
  const { includeEmail, includeEmailParam, isNewSignup } = options || {};

  // Check for organization invite
  const orgInviteId = searchParams.get("orgInviteId");
  if (orgInviteId) {
    let url = `/org-invite/${orgInviteId}?autoAccept=true`;
    if (includeEmail) {
      url += `&email=${encodeURIComponent(includeEmail)}`;
    }
    return url;
  }

  // Check for collection/generic invite
  const inviteId = searchParams.get("inviteId");
  if (inviteId) {
    let url = `/invites/${inviteId}?autoAccept=true`;
    if (includeEmail) {
      url += `&email=${encodeURIComponent(includeEmail)}`;
    }
    return url;
  }

  // Check for explicit callback URL
  const explicitCallback =
    searchParams.get("callbackUrl") || searchParams.get("redirect");
  if (explicitCallback) {
    return explicitCallback;
  }

  // Default behavior based on whether this is a new signup
  if (isNewSignup) {
    return "/app/onboarding";
  }

  // Default signin redirect
  let defaultUrl = "/app/dashboard";

  // Add email param if requested
  if (includeEmailParam && includeEmail) {
    defaultUrl += `?email=${encodeURIComponent(includeEmail)}`;
  }

  return defaultUrl;
}
