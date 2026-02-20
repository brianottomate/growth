"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@wandercom/design-system-web/ui/button";
import { useNewsletter } from "@/hooks/useNewsletter";

export default function NewsletterCTA() {
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

  return (
    <div
      id="newsletter"
      className="relative isolate flex flex-col gap-10 overflow-hidden rounded-3xl bg-gray-900 px-6 py-24 shadow-2xl sm:px-24 md:h-96 xl:flex-row xl:items-center xl:py-32"
    >
      <div className="max-w-2xl text-white xl:max-w-none xl:flex-auto">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Want to stay updated?
        </h2>
        <p className="mt-2">
          Subscribe to our newsletter for updates, tips, and news
        </p>
      </div>
      {wasSubscribedOnMount || justSubscribed ? (
        <div className="thank-you-card mx-auto mt-10 max-w-lg rounded-lg bg-linear-to-r from-blue-900 to-blue-500 p-8 text-white shadow-md">
          <h2 className="mb-4 text-2xl font-semibold">
            {wasSubscribedOnMount && !justSubscribed
              ? "You're already subscribed! 🎉"
              : "Thank you for subscribing! 🙌"}
          </h2>
          <p className="text-md">
            You&apos;ve successfully been added to our mailing list.
            {subscribedEmail && (
              <>
                <br />
                <span className="mt-2 inline-block text-sm opacity-90">
                  ({subscribedEmail})
                </span>
              </>
            )}
          </p>
        </div>
      ) : (
        <form className="w-full max-w-md" onSubmit={onSubmit}>
          {userState === "real" ? (
            <Button
              type="submit"
              variant="secondary"
              size="md"
              disabled={isSubscribing}
              className="w-full bg-white text-neutral-900 hover:bg-neutral-100"
            >
              {isSubscribing ? "..." : "Subscribe to Newsletter"}
            </Button>
          ) : (
            <div className="flex gap-x-4">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                autoComplete="email"
                required={userState === "logged-out"}
                className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2.5 text-white shadow-sm ring-1 ring-white/10 ring-inset placeholder:text-white/40 focus:ring-2 focus:ring-white focus:ring-inset sm:text-sm sm:leading-6"
                placeholder={
                  userState === "anonymous"
                    ? "Enter your email (optional)"
                    : "Enter your email"
                }
                {...form.register("email", {
                  required: userState === "logged-out",
                })}
                disabled={isSubscribing}
              />
              <Button
                type="submit"
                variant="secondary"
                size="md"
                disabled={isSubscribing}
                className="flex-none bg-white text-neutral-900 hover:bg-neutral-100"
              >
                {isSubscribing ? "..." : "Notify me"}
              </Button>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

          <p className="mt-4 text-sm leading-6 text-gray-400">
            We care about your data. Read our{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="font-semibold text-white hover:text-gray-200"
            >
              privacy&nbsp;policy
            </Link>
            .
          </p>
        </form>
      )}

      <svg
        viewBox="0 0 1024 1024"
        className="absolute top-1/2 left-1/2 -z-10 h-256 w-256 -translate-x-1/2"
        aria-hidden="true"
      >
        <circle
          cx="512"
          cy="512"
          r="512"
          fill="url(#newsletterGradient)"
          fillOpacity="0.7"
        />
        <defs>
          <radialGradient
            id="newsletterGradient"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(512 512) rotate(90) scale(512)"
          >
            <stop stopColor="rgb(59, 130, 246)" />
            <stop offset="1" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
