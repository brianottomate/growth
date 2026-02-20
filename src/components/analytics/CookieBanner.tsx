"use client";

import * as React from "react";
import { Cookie } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import { Button } from "@wandercom/design-system-web/ui/button";
import { Text } from "@wandercom/design-system-web/ui/text";
import { Heading } from "@wandercom/design-system-web/ui/heading";

interface CookieBannerProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  description?: string;
  learnMoreHref?: string;
  className?: string;
}

export const CookieBanner = ({
  isOpen,
  onAccept,
  onDecline,
  description = "We use cookies to improve your experience and analyze site usage. By continuing, you accept our use of cookies.",
  learnMoreHref = "/privacy",
  className,
}: CookieBannerProps) => {
  const [isAnimatingOut, setIsAnimatingOut] = React.useState(false);

  const handleAccept = React.useCallback(() => {
    setIsAnimatingOut(true);
    onAccept();
  }, [onAccept]);

  const handleDecline = React.useCallback(() => {
    setIsAnimatingOut(true);
    onDecline();
  }, [onDecline]);

  // Reset animation state when reopened
  React.useEffect(() => {
    if (isOpen) {
      setIsAnimatingOut(false);
    }
  }, [isOpen]);

  // Don't render if not open and not animating
  if (!isOpen && !isAnimatingOut) return null;

  return (
    <div
      className={cn(
        "fixed right-0 bottom-0 left-0 z-50 w-full transition-all duration-700 sm:bottom-4 sm:left-4 sm:max-w-md",
        isAnimatingOut || !isOpen
          ? "translate-y-full opacity-0"
          : "translate-y-0 opacity-100",
        className,
      )}
    >
      <div className="bg-surface-modal border-primary m-3 rounded-lg border p-6 shadow-lg">
        <div className="mb-4 flex flex-row items-center justify-between">
          <Heading variant="headline-sm" as="h2">
            We use cookies
          </Heading>
          <Cookie className="text-secondary h-5 w-5" />
        </div>
        <div className="space-y-3">
          <Text variant="body" color="secondary">
            {description}
          </Text>
          <Text variant="body-sm" color="tertiary">
            By clicking <span className="font-medium">&quot;Accept&quot;</span>,
            you agree to our use of cookies.
          </Text>
          <a
            href={learnMoreHref}
            className="text-primary inline-block text-sm underline underline-offset-4 hover:no-underline"
          >
            Learn more
          </a>
        </div>
        <div className="mt-6 flex gap-2">
          <Button
            onClick={handleDecline}
            variant="secondary"
            size="md"
            className="flex-1"
          >
            Decline
          </Button>
          <Button onClick={handleAccept} variant="primary" size="md" className="flex-1">
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
};

// Component to re-show consent banner for users who previously declined
interface CookiePreferencesLinkProps {
  children?: React.ReactNode;
  className?: string;
}

export const CookiePreferencesLink = ({
  children = "Manage Cookie Preferences",
  className,
}: CookiePreferencesLinkProps) => {
  const handleClick = React.useCallback(() => {
    // Remove consent from localStorage to trigger banner
    localStorage.removeItem("cookieConsent");
    localStorage.removeItem("cookieConsentTimestamp");
    // Trigger a custom event to notify AnalyticsProvider
    window.dispatchEvent(new CustomEvent("reShowConsentBanner"));
  }, []);

  return (
    <Text
      as="span"
      variant="body-sm"
      className={cn(
        "cursor-pointer underline underline-offset-4 hover:no-underline",
        className,
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {children}
    </Text>
  );
};
