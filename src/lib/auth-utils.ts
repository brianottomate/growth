/** Auth utilities for email provider detection and callback URL handling. */

export const DEFAULT_PASSWORD_RESET_REDIRECT = "/reset-password";
export const AUTH_RETURN_TO_HEADER = "x-auth-return-to";

const INTERNAL_URL_BASE = "https://growth.invalid";

/** Accept only same-app paths, including query strings and fragments. */
export function getSafeInternalPath(value: string | null): string | null {
  if (!value?.startsWith("/")) return null;

  try {
    const url = new URL(value, INTERNAL_URL_BASE);
    if (url.origin !== INTERNAL_URL_BASE) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Preserve safe auth context when moving between sign-in and sign-up. */
export function getAuthPageHref(
  pathname: "/signin" | "/signup",
  searchParams: URLSearchParams,
): string {
  const params = new URLSearchParams();

  for (const key of ["inviteId", "orgInviteId", "email"] as const) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  const returnTo = getSafeInternalPath(
    searchParams.get("returnTo") ??
      searchParams.get("callbackUrl") ??
      searchParams.get("redirect"),
  );
  if (returnTo) params.set("returnTo", returnTo);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

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

  // Better Auth's OAuth provider sends the signed authorization request to the
  // login page. After authentication, resume that internal authorize endpoint
  // instead of dropping the user into the app and abandoning the connector.
  if (searchParams.has("client_id") && searchParams.has("redirect_uri")) {
    return `/api/auth/oauth2/authorize?${searchParams.toString()}`;
  }

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
    searchParams.get("returnTo") ??
    searchParams.get("callbackUrl") ??
    searchParams.get("redirect");
  if (explicitCallback) {
    const fallback = isNewSignup ? "/app/onboarding" : "/app";
    return getSafeInternalPath(explicitCallback) ?? fallback;
  }

  // Default behavior based on whether this is a new signup
  if (isNewSignup) {
    return "/app/onboarding";
  }

  // Default signin redirect
  let defaultUrl = "/app";

  // Add email param if requested
  if (includeEmailParam && includeEmail) {
    defaultUrl += `?email=${encodeURIComponent(includeEmail)}`;
  }

  return defaultUrl;
}
