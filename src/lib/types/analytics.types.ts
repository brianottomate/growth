// =====================================================
// EVENT NAME DEFINITIONS
// =====================================================
//
// NAMING CONVENTIONS:
//
// Server Events (past tense - completed actions):
//   - {resource}_{past_tense_verb}: user_signed_up, profile_uploaded, subscription_activated
//   - Describes what actually happened in the database/backend
//
// Client Events (present tense + action verb - user interactions):
//   - {resource}_{action}_clicked: sign_up_clicked, upgrade_clicked
//   - {resource}_dialog_opened: event_dialog_opened, upgrade_dialog_opened
//   - {resource}_toggled: theme_toggled, settings_toggled
//   - Describes user UI interactions, not outcomes
//
// Pattern: Track clicks (not useEffect/dialog state) to avoid duplicates
// =====================================================

export type ServerAnalyticsEventName =
  // ─────────────────────────────────────────────────
  // User authentication events
  // ─────────────────────────────────────────────────
  | "user_signed_up" // ✅ First account creation (anonymous or email)
  | "user_account_created" // ✅ Added email/password or OAuth credentials
  | "user_signed_in" // ✅
  | "user_signed_out" // ✅
  | "user_email_verified" // ✅

  // ─────────────────────────────────────────────────
  // Anonymous user events (Lead generation)
  // ─────────────────────────────────────────────────
  | "anonymous_user_created" // Guest started using app
  | "anonymous_user_converted" // Guest → Real account

  // ─────────────────────────────────────────────────
  // User management
  // ─────────────────────────────────────────────────
  | "user_profile_updated"
  | "user_deleted"

  // ─────────────────────────────────────────────────
  // Placeholder for your app-specific events
  // ─────────────────────────────────────────────────
  | "placeholder_server_event";

export type ClientAnalyticsEventName =
  // ─────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────
  | "page_viewed"

  // ─────────────────────────────────────────────────
  // User authentication UI
  // ─────────────────────────────────────────────────
  | "sign_up_clicked"
  | "sign_in_clicked"
  | "sign_out_clicked"

  // ─────────────────────────────────────────────────
  // Anonymous conversion funnel
  // ─────────────────────────────────────────────────
  | "conversion_dialog_opened" // Dialog shown to anonymous user
  | "conversion_dialog_dismissed" // User dismissed without converting

  // ─────────────────────────────────────────────────
  // Generic UI interactions
  // ─────────────────────────────────────────────────
  | "button_clicked"
  | "form_submitted"
  | "navigation_clicked"

  // ─────────────────────────────────────────────────
  // Placeholder for your app-specific events
  // ─────────────────────────────────────────────────
  | "placeholder_client_event";

// =====================================================
// EVENT PROPERTIES DEFINITIONS - SERVER
// =====================================================

type EmailAndPasswordMethod = "email";
type OAuthMethod = "oauth";
type SupportedAuthProvider = "google" | "github";

export type ServerEventPropertiesDefinition = {
  // ─────────────────────────────────────────────────
  // User authentication events
  // ─────────────────────────────────────────────────
  user_signed_up:
    | {
        method: "anonymous";
      }
    | {
        method: EmailAndPasswordMethod;
        email: string;
      }
    | {
        method: OAuthMethod;
        provider: SupportedAuthProvider;
        email: string;
      };

  user_account_created:
    | {
        method: EmailAndPasswordMethod;
      }
    | {
        method: OAuthMethod;
        provider: SupportedAuthProvider;
      };

  user_signed_in: {
    method: string; // "email", "google", "github", etc. - flexible for any auth method
  };

  user_signed_out: undefined;

  user_email_verified: {
    email: string;
  };

  // ─────────────────────────────────────────────────
  // Anonymous user events
  // ─────────────────────────────────────────────────
  anonymous_user_created: {
    source: string; // "upload_flow", "comparison_view", "direct", etc.
  };

  anonymous_user_converted: {
    previousUserId: string;
    daysSinceCreation: number;
  };

  // ─────────────────────────────────────────────────
  // User management
  // ─────────────────────────────────────────────────
  user_profile_updated: {
    fieldsChanged: string[];
  };

  user_deleted: {
    reason?: string;
  };

  // ─────────────────────────────────────────────────
  // Placeholder for your app-specific events
  // ─────────────────────────────────────────────────
  placeholder_server_event: {
    // Add your properties here
    exampleProperty?: string;
  };
};

// =====================================================
// EVENT PROPERTIES DEFINITIONS - CLIENT
// =====================================================

export type ClientEventPropertiesDefinition = {
  // ─────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────
  page_viewed: {
    path: string;
    referrer?: string;
  };

  // ─────────────────────────────────────────────────
  // User authentication UI
  // ─────────────────────────────────────────────────
  sign_up_clicked:
    | {
        method: EmailAndPasswordMethod;
        source: string; // "conversion_modal", "signin_page", "navbar", etc.
      }
    | {
        method: OAuthMethod;
        provider: SupportedAuthProvider;
        source: string;
      };

  sign_in_clicked:
    | {
        method: "username" | "email";
        source: string; // "conversion_modal", "signin_page", "navbar", etc.
      }
    | {
        method: OAuthMethod;
        provider: SupportedAuthProvider;
        source: string;
      };

  sign_out_clicked: undefined;

  // ─────────────────────────────────────────────────
  // Anonymous conversion funnel
  // ─────────────────────────────────────────────────
  conversion_dialog_opened: {
    reason: string; // "feature_gate", "share_prompt", "manual", etc.
    hasProfile?: boolean;
  };

  conversion_dialog_dismissed: {
    reason: string; // "feature_gate", "share_prompt", "manual", etc.
    timeSpentSeconds: number;
  };

  // ─────────────────────────────────────────────────
  // Generic UI interactions
  // ─────────────────────────────────────────────────
  button_clicked: {
    buttonId: string;
    label: string;
  };

  form_submitted: {
    formId: string;
  };

  navigation_clicked: {
    from: string;
    to: string;
  };

  // ─────────────────────────────────────────────────
  // Placeholder for your app-specific events
  // ─────────────────────────────────────────────────
  placeholder_client_event: {
    // Add your properties here
    exampleProperty?: string;
  };
};

// =====================================================
// EXHAUSTIVENESS VALIDATION
// =====================================================

// Helper type - will show TypeScript error if any event is missing properties
type EnsureExhaustiveServerEvents<T> = {
  [K in ServerAnalyticsEventName]: K extends keyof T
    ? T[K]
    : `Missing server event: ${K}`;
};

type EnsureExhaustiveClientEvents<T> = {
  [K in ClientAnalyticsEventName]: K extends keyof T
    ? T[K]
    : `Missing client event: ${K}`;
};

// These enforce exhaustiveness at compile-time
export type ServerEventPropertiesMap =
  EnsureExhaustiveServerEvents<ServerEventPropertiesDefinition>;
export type ClientEventPropertiesMap =
  EnsureExhaustiveClientEvents<ClientEventPropertiesDefinition>;

// =====================================================
// METADATA & TRAITS
// =====================================================

export interface AnalyticsMetadata {
  timestamp?: Date;
  groups?: {
    organization?: string;
    team?: string;
    [key: string]: string | undefined;
  };
  ip?: string; // Client IP for PostHog GeoIP (auto-extracted if not provided)
  isAnonymous?: boolean; // Skip certain providers (like email) for anonymous users
}

export interface UserTraits {
  email?: string;
  name?: string;
  username?: string;
  isAnonymous?: boolean;
  city?: string;
  country?: string;
  [key: string]: unknown;
}

// =====================================================
// COMPILE-TIME VALIDATION
// =====================================================

type ValidateServerEvents =
  keyof ServerEventPropertiesDefinition extends ServerAnalyticsEventName
    ? ServerAnalyticsEventName extends keyof ServerEventPropertiesDefinition
      ? true
      : `Extra server events found: ${Exclude<keyof ServerEventPropertiesDefinition, ServerAnalyticsEventName>}`
    : `Missing server events: ${Exclude<ServerAnalyticsEventName, keyof ServerEventPropertiesDefinition>}`;

type ValidateClientEvents =
  keyof ClientEventPropertiesDefinition extends ClientAnalyticsEventName
    ? ClientAnalyticsEventName extends keyof ClientEventPropertiesDefinition
      ? true
      : `Extra client events found: ${Exclude<keyof ClientEventPropertiesDefinition, ClientAnalyticsEventName>}`
    : `Missing client events: ${Exclude<ClientAnalyticsEventName, keyof ClientEventPropertiesDefinition>}`;

// Compile-time assertions
const _serverEventsValidation: ValidateServerEvents = true;
const _clientEventsValidation: ValidateClientEvents = true;

// Prevent unused variable warnings
export const __typeValidation = {
  _serverEventsValidation,
  _clientEventsValidation,
};
