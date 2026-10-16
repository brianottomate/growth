"use client";

import { Button } from "@wandercom/design-system-web/ui/button";
import { Logo } from "@wandercom/design-system-web/ui/logo";
import { Progress } from "@wandercom/design-system-web/ui/progress";

import {
  ConnectView,
  InactiveConnect,
} from "@/app/connect/[token]/ConnectView";

import { CONNECT_STATES, type Scenario, scenarioData } from "./fixtures";
import { ConnectSection, EmailSection, Hub, Receipt } from "./sections";
import { SUPPORT_EMAIL, type Step, buildBrandSteps } from "./steps";

type Frame = {
  id: string;
  caption: string;
  /** Why the screen is the way it is, for whoever reviews the lab. */
  note?: string;
  gate?: boolean;
  /** Growth's own pages run on growth's dark theme and need desktop width. */
  growth?: boolean;
  node: React.ReactNode;
};

/**
 * Every screen of the proposed intake side by side, inert. Brand steps first
 * and sent on their own, so a client who stalls on an ad account has still
 * given us everything we need to start. The other sections hang off a hub
 * and read live state, so they can be done later and in any order.
 */
export function IntakeLab({ scenario }: { scenario: Scenario }) {
  const data = scenarioData(scenario);
  const steps = buildBrandSteps(data.prefill, data.listings, data.answers);

  const frames: Frame[] = [
    {
      id: "welcome",
      caption: "Welcome panel",
      node: <WelcomePanel brand={data.prefill.brand} />,
    },
    {
      id: "hub",
      caption: "Your setup",
      note: "The link's landing page. Each row's status comes from its owner, so returning to it is the resume.",
      node: <Hub data={data} />,
    },
    ...steps.map((step, index) => ({
      id: `brand-${index + 1}`,
      caption: `Brand ${index + 1} · ${step.label}`,
      note:
        index === steps.length - 1
          ? "Writes the performance_intake receipt. Connecting comes after, so an ads login problem never costs us the answers."
          : step.label === "Content and guests"
            ? "Consent appears with the guest list link and is required once one is given."
            : undefined,
      gate: index < steps.length - 1 ? step.complete : undefined,
      node: <StepFrame step={step} index={index} total={steps.length} />,
    })),
    ...(data.sentAt
      ? [
          {
            id: "receipt",
            caption: "Brand · what you sent",
            note: "Read-only, from the receipt. Shown only on a token link; edits go through the rep.",
            node: (
              <Receipt
                answers={data.answers}
                sentAt={data.sentAt}
                repName={data.prefill.repName}
              />
            ),
          },
        ]
      : []),
    {
      id: "connect",
      caption: "Ads and social",
      note: "Inline on the intake, not a hop to Growth. Each platform is one block: Meta carries its ad account (a summary with Change once chosen, as in #716) and its setup checks.",
      node: (
        <ConnectSection
          connections={data.connections}
          setup={data.setup}
          metaChosen={scenario.stage === "done"}
        />
      ),
    },
    {
      id: "email",
      caption: "Email",
      note: "Last, with its own send: reply-to to emailSender, the rest to Performance settings, and a Slack note to the team. The optional sending domain sits underneath and checks itself.",
      node: (
        <EmailSection prefs={data.emailPreferences} domain={data.emailDomain} />
      ),
    },
    { id: "inactive", caption: "Inactive link", node: <InactiveLink /> },
    ...CONNECT_STATES.map((state) => ({
      id: state.id,
      caption: state.caption,
      note: "Today's page, for comparison.",
      growth: true,
      node: <ConnectView {...state.props} />,
    })),
    {
      id: "connect-inactive",
      caption: "Today · growth connect, inactive link",
      growth: true,
      node: <InactiveConnect />,
    },
  ];

  return (
    <>
      <nav className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-border-primary bg-surface-primary px-4 py-2 sm:px-8">
        {frames.map((frame) => (
          <a
            key={frame.id}
            href={`#${frame.id}`}
            className="shrink-0 rounded-full border border-border-secondary px-3 py-1 text-xs hover:border-primary"
          >
            {frame.caption}
          </a>
        ))}
      </nav>

      <div className="flex snap-x snap-mandatory scroll-px-4 gap-6 overflow-x-auto px-4 py-6 sm:scroll-px-8 sm:px-8">
        {frames.map((frame) => (
          <figure
            key={frame.id}
            id={frame.id}
            className={`flex shrink-0 snap-start flex-col gap-2 ${
              frame.growth ? "w-[min(88vw,64rem)]" : "w-[min(88vw,32rem)]"
            }`}
          >
            <figcaption className="flex items-baseline justify-between text-xs">
              <span className="font-medium">{frame.caption}</span>
              {frame.gate !== undefined && (
                <span
                  className={frame.gate ? "text-secondary" : "text-amber-600"}
                >
                  {frame.gate ? "Next enabled" : "Next blocked"}
                </span>
              )}
            </figcaption>
            {frame.note && (
              <p className="text-xs leading-relaxed text-secondary">
                {frame.note}
              </p>
            )}
            {/* wander.com pins data-theme="light"; growth renders dark. */}
            <div
              inert
              data-theme={frame.growth ? "dark" : "light"}
              className="flex-1 overflow-hidden rounded-2xl border border-border-primary bg-surface-primary text-primary"
            >
              {frame.node}
            </div>
          </figure>
        ))}
      </div>
    </>
  );
}

function StepFrame({
  step,
  index,
  total,
  body,
}: {
  step: Step;
  index: number;
  total: number;
  body?: React.ReactNode;
}) {
  const isLast = index >= total - 1;
  return (
    <section className="flex h-full flex-col px-6 py-8">
      <div>
        <div className="flex items-baseline justify-between text-xs text-secondary">
          <span className="font-medium tracking-wide uppercase">
            {step.label}
          </span>
          <span className="tabular-nums">
            {index + 1} / {total}
          </span>
        </div>
        <Progress value={((index + 1) / total) * 100} className="mt-2 h-1" />
      </div>

      <div className="mt-8 min-h-[22rem]">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">
          {step.title}
        </h1>
        {step.help && (
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            {step.help}
          </p>
        )}
        <div className="mt-6 space-y-5">{body ?? step.body}</div>
      </div>

      <div className="mt-8 flex items-center gap-3 border-t border-border-secondary pt-6">
        {index > 0 && (
          <Button variant="ghost" size="sm">
            Back
          </Button>
        )}
        {!isLast && (
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            disabled={!step.complete}
          >
            {index === 0 ? "Start" : "Next"}
          </Button>
        )}
      </div>
    </section>
  );
}

function WelcomePanel({ brand }: { brand: string }) {
  return (
    <aside className="flex h-full flex-col justify-between gap-10 px-6 py-10">
      <div>
        <Logo variant="logo" className="h-7 w-auto text-primary" />
        <h2 className="mt-10 text-2xl leading-tight font-semibold tracking-tight">
          Welcome {brand} to Performance by Wander
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          Let&apos;s get you set up for success so we can grow your demand and
          direct revenue.
        </p>
        <ol className="mt-8 space-y-4">
          {[
            "Five minutes about your brand, and we can start",
            "Connect your ad and social accounts, now or later",
            "Set up email whenever suits you",
          ].map((line, index) => (
            <li key={line} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border-secondary text-[11px] font-medium text-secondary">
                {index + 1}
              </span>
              <span className="text-sm leading-relaxed">{line}</span>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-xs leading-relaxed text-secondary">
          Questions before you start?{" "}
          <span className="underline">{SUPPORT_EMAIL}</span>
        </p>
      </div>
      <p className="text-xs text-secondary">Find your happy place ®</p>
    </aside>
  );
}

function InactiveLink() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center px-6">
      <div className="max-w-sm text-center">
        <Logo variant="logomark" className="mx-auto mb-6 h-10 w-auto" />
        <h1 className="text-xl font-semibold">This link is no longer active</h1>
        <p className="mt-2 text-sm text-secondary">
          Ask your Wander contact for a fresh one.
        </p>
      </div>
    </div>
  );
}
