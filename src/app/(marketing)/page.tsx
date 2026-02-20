import Link from "next/link";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";
import { Button } from "@wandercom/design-system-web/ui/button";
import { Code2, Rocket, BookOpen, Sparkles, ArrowRight } from "lucide-react";

export default function IntroPage() {
  return (
    <div className="isolate">
      {/* Hero section */}
      <div className="relative pt-14">
        <div
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
          aria-hidden="true"
        >
          <div
            className="from-primary/30 to-primary relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
          />
        </div>

        <div className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-8 flex justify-center">
                <div className="border-secondary relative rounded-full border px-4 py-1.5">
                  <Text variant="body-sm" weight="medium">
                    Modern Next.js 16 Template
                  </Text>
                </div>
              </div>

              <Heading variant={{ base: "display", md: "display-lg" }} as="h1">
                Welcome to Your{" "}
                <span className="text-primary">Production-Ready</span> Template
              </Heading>

              <Text
                variant="body-lg-long"
                color="secondary"
                className="mt-6"
              >
                A comprehensive Next.js 16 starter with cutting-edge features,
                best practices, and production-ready patterns. Built with
                TypeScript, tRPC, Drizzle ORM, and Better Auth.
              </Text>

              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link href="/app/demos">
                  <Button variant="primary" size="lg" className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Explore Demos
                  </Button>
                </Link>
                <Link href="/blog">
                  <Button variant="outline" size="lg" className="gap-2">
                    Read Blog
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features Grid */}
            <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
              <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-3">
                <div className="bg-surface-secondary border-secondary hover:border-primary/50 relative overflow-hidden rounded-xl border p-6 transition-all hover:shadow-lg">
                  <div className="bg-surface-secondary border-secondary mb-4 flex h-12 w-12 items-center justify-center rounded-lg border">
                    <Code2 className="text-primary h-6 w-6" />
                  </div>
                  <Heading variant="headline-sm" as="h3">
                    Modern Stack
                  </Heading>
                  <Text variant="body" color="secondary" className="mt-2">
                    Next.js 16, React 19, TypeScript, tRPC, Drizzle ORM,
                    Better Auth, Tailwind CSS 4, and more.
                  </Text>
                </div>

                <div className="bg-surface-secondary border-secondary hover:border-primary/50 relative overflow-hidden rounded-xl border p-6 transition-all hover:shadow-lg">
                  <div className="bg-surface-secondary border-secondary mb-4 flex h-12 w-12 items-center justify-center rounded-lg border">
                    <BookOpen className="text-primary h-6 w-6" />
                  </div>
                  <Heading variant="headline-sm" as="h3">
                    Best Practices
                  </Heading>
                  <Text variant="body" color="secondary" className="mt-2">
                    Comprehensive demos showing Server Components, Client
                    Components, forms, auth, and more production patterns.
                  </Text>
                </div>

                <div className="bg-surface-secondary border-secondary hover:border-primary/50 relative overflow-hidden rounded-xl border p-6 transition-all hover:shadow-lg">
                  <div className="bg-surface-secondary border-secondary mb-4 flex h-12 w-12 items-center justify-center rounded-lg border">
                    <Rocket className="text-primary h-6 w-6" />
                  </div>
                  <Heading variant="headline-sm" as="h3">
                    Production Ready
                  </Heading>
                  <Text variant="body" color="secondary" className="mt-2">
                    Authentication, database, file uploads, newsletters,
                    events tracking - everything you need to ship fast.
                  </Text>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div
          className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]"
          aria-hidden="true"
        >
          <div
            className="from-primary to-primary/30 relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
          />
        </div>
      </div>

      {/* What's Included Section */}
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <Text variant="body" weight="medium" color="secondary">
            Everything you need
          </Text>
          <Heading
            variant={{ base: "headline-lg", md: "display-sm" }}
            as="h2"
            className="mt-2"
          >
            What&apos;s included in this template
          </Heading>
          <Text
            variant="body-lg-long"
            color="secondary"
            className="mt-6"
          >
            A complete, production-ready foundation for building modern web
            applications.
          </Text>
        </div>

        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-2">
            <div className="flex flex-col">
              <dt className="flex items-center gap-x-3">
                <div className="bg-surface-secondary border-secondary flex h-10 w-10 items-center justify-center rounded-lg border">
                  <Code2 className="text-primary h-6 w-6" />
                </div>
                <Heading variant="headline-sm" as="h3">
                  Type-Safe Development
                </Heading>
              </dt>
              <dd className="mt-4 flex flex-auto flex-col">
                <Text variant="body-lg-long" color="secondary" className="flex-auto">
                  End-to-end type safety with TypeScript, tRPC, and Drizzle ORM.
                  Catch errors at compile time, not runtime.
                </Text>
              </dd>
            </div>

            <div className="flex flex-col">
              <dt className="flex items-center gap-x-3">
                <div className="bg-surface-secondary border-secondary flex h-10 w-10 items-center justify-center rounded-lg border">
                  <Sparkles className="text-primary h-6 w-6" />
                </div>
                <Heading variant="headline-sm" as="h3">
                  Modern Authentication
                </Heading>
              </dt>
              <dd className="mt-4 flex flex-auto flex-col">
                <Text variant="body-lg-long" color="secondary" className="flex-auto">
                  Better Auth with email/password, magic links, OAuth providers,
                  and anonymous sessions. Role-based access control included.
                </Text>
              </dd>
            </div>

            <div className="flex flex-col">
              <dt className="flex items-center gap-x-3">
                <div className="bg-surface-secondary border-secondary flex h-10 w-10 items-center justify-center rounded-lg border">
                  <BookOpen className="text-primary h-6 w-6" />
                </div>
                <Heading variant="headline-sm" as="h3">
                  Comprehensive Demos
                </Heading>
              </dt>
              <dd className="mt-4 flex flex-auto flex-col">
                <Text variant="body-lg-long" color="secondary" className="flex-auto">
                  Learn Next.js 16 best practices with working examples of
                  Server Components, forms, data fetching, file uploads, and
                  more.
                </Text>
              </dd>
            </div>

            <div className="flex flex-col">
              <dt className="flex items-center gap-x-3">
                <div className="bg-surface-secondary border-secondary flex h-10 w-10 items-center justify-center rounded-lg border">
                  <Rocket className="text-primary h-6 w-6" />
                </div>
                <Heading variant="headline-sm" as="h3">
                  Ready to Deploy
                </Heading>
              </dt>
              <dd className="mt-4 flex flex-auto flex-col">
                <Text variant="body-lg-long" color="secondary" className="flex-auto">
                  Vercel-optimized with edge functions, Neon PostgreSQL, Vercel
                  Blob storage, and Resend for emails. Deploy in minutes.
                </Text>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* CTA Section */}
      <div className="mx-auto max-w-7xl px-6 pb-24 sm:pb-32 lg:px-8">
        <div className="relative isolate overflow-hidden rounded-3xl bg-neutral-900 px-6 py-24 shadow-2xl sm:px-24 xl:py-32">
          <Heading
            variant={{ base: "headline-lg", md: "display-sm" }}
            as="h2"
            className="mx-auto max-w-2xl text-center text-white"
          >
            Start building your next project today
          </Heading>
          <Text
            variant="body-lg"
            color="secondary"
            className="mx-auto mt-2 max-w-xl text-center text-white/70"
          >
            Explore the demos, read the blog, or dive into the code. Everything
            you need is ready to go.
          </Text>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link href="/app/demos">
              <Button
                variant="secondary"
                size="lg"
                className="gap-2 bg-white text-neutral-900 hover:bg-neutral-100"
              >
                <Sparkles className="h-4 w-4" />
                View Demos
              </Button>
            </Link>
            <Link href="/app">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 border-white/30 text-white hover:bg-white/10"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <svg
            viewBox="0 0 1024 1024"
            className="absolute top-1/2 left-1/2 -z-10 h-[64rem] w-[64rem] -translate-x-1/2 [mask-image:radial-gradient(closest-side,white,transparent)]"
            aria-hidden="true"
          >
            <circle
              cx={512}
              cy={512}
              r={512}
              fill="url(#cta-gradient)"
              fillOpacity="0.15"
            />
            <defs>
              <radialGradient id="cta-gradient">
                <stop stopColor="white" />
                <stop offset={1} stopColor="white" stopOpacity={0} />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}
