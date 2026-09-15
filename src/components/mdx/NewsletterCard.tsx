"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Check } from "lucide-react";
import { Button } from "@wandercom/design-system-web/ui/button";

import { useNewsletter } from "@/hooks/useNewsletter";

interface NewsletterCardProps {
  title?: string;
  description?: string;
  buttonText?: string;
  features?: Array<{
    label: string;
    description?: string;
  }>;
}

export function NewsletterCard({
  title = "Stay in the loop",
  description = "Get the latest updates, tips, and insights delivered to your inbox. No spam, just valuable content.",
  buttonText = "Subscribe",
  features,
}: NewsletterCardProps) {
  const [justSubscribed, setJustSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    isSubscribedToTopic,
    subscribe: subscribeToNewsletter,
    userState,
    email: subscribedEmail,
    isLoading,
  } = useNewsletter({
    autoFetch: true,
  });

  const wasAlreadySubscribed = isSubscribedToTopic("newsletter-general");
  const [wasSubscribedOnMount, setWasSubscribedOnMount] = useState(false);

  useEffect(() => {
    if (!isLoading && wasAlreadySubscribed && !justSubscribed) {
      setWasSubscribedOnMount(true);
    }
  }, [isLoading, wasAlreadySubscribed, justSubscribed]);

  const form = useForm({
    defaultValues: {
      email: subscribedEmail || "",
    },
  });

  useEffect(() => {
    if (subscribedEmail && !form.getValues("email")) {
      form.setValue("email", subscribedEmail);
    }
  }, [subscribedEmail, form]);

  const defaultFeatures = [
    {
      label: "Product updates",
      description: "Be the first to know about new features and improvements",
    },
    {
      label: "Tips & best practices",
      description: "Actionable advice to get the most out of the platform",
    },
    {
      label: "No spam",
      description: "Unsubscribe at any time, no questions asked",
    },
  ];

  const displayFeatures = features || defaultFeatures;

  const onSubmit = form.handleSubmit(async (data) => {
    setIsSubscribing(true);
    setError(null);

    try {
      await subscribeToNewsletter({
        email: data.email,
        topic: "newsletter-general",
      });
      setJustSubscribed(true);
    } catch (err) {
      console.error("Failed to subscribe:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to subscribe. Please try again.",
      );
    } finally {
      setIsSubscribing(false);
    }
  });

  if (wasSubscribedOnMount || justSubscribed) {
    return (
      <section className="not-prose relative my-8 overflow-hidden rounded-xl border border-secondary bg-surface-secondary shadow-sm">
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-surface-tertiary">
              <Check className="h-6 w-6 text-emerald-500" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-primary">
                {wasSubscribedOnMount && !justSubscribed
                  ? "You're already subscribed!"
                  : "Thanks for subscribing!"}
              </h3>
              <p className="mt-2 text-secondary">
                You&apos;ve been added to our mailing list. Watch your inbox for
                great content!
                {subscribedEmail && (
                  <>
                    <br />
                    <span className="mt-2 inline-block text-sm text-tertiary">
                      ({subscribedEmail})
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="not-prose relative my-8 overflow-hidden rounded-xl border border-secondary bg-surface-secondary shadow-sm transition-shadow hover:shadow-md">
      <div className="relative z-10 p-6 sm:p-8">
        <h2 className="text-[1.75rem] leading-[110%] font-bold tracking-tight text-primary">
          {title}
        </h2>

        <p className="mt-3 text-lg leading-[160%] text-secondary">
          {description}
        </p>

        <ul className="mt-5 space-y-2.5">
          {displayFeatures.map((feature, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span className="mt-0.5 block flex-none">
                <Check className="size-5 text-emerald-500" strokeWidth={2.5} />
              </span>
              <span className="block flex-1 text-[15px] leading-relaxed">
                <span className="font-semibold text-primary">
                  {feature.label}
                  {feature.description && ": "}
                </span>
                {feature.description && (
                  <span className="text-secondary">{feature.description}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <form onSubmit={onSubmit} className="mt-6">
          {userState === "real" ? (
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isSubscribing}
              className="w-full"
            >
              {isSubscribing ? "Subscribing..." : buttonText}
            </Button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                placeholder={
                  userState === "anonymous"
                    ? "Enter your email (optional)"
                    : "Enter your email"
                }
                required={userState === "logged-out"}
                className="flex-1 rounded-md border border-secondary bg-surface-input px-3 py-2.5 text-sm text-primary shadow-xs transition-colors placeholder:text-tertiary focus:border-primary focus:ring-2 focus:ring-current/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("email", {
                  required: userState === "logged-out",
                })}
                disabled={isSubscribing}
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubscribing}
                className="flex-none"
              >
                {isSubscribing ? "..." : buttonText}
              </Button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        </form>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 transform-gpu overflow-hidden blur-3xl"
      >
        <div
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
          className="absolute right-0 bottom-0 aspect-1155/678 w-144.5 translate-x-[20%] translate-y-[30%] rotate-12 bg-linear-to-tr from-amber-300 to-amber-600 opacity-10"
        />
      </div>
    </section>
  );
}
