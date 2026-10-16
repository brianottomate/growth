"use client";

import { Button } from "@wandercom/design-system-web/ui/button";
import { Logo } from "@wandercom/design-system-web/ui/logo";
import { Progress } from "@wandercom/design-system-web/ui/progress";

import {
  ConnectView,
  InactiveConnect,
} from "@/app/connect/[token]/ConnectView";

import { CONNECT_STATES, type Scenario, scenarioData } from "./fixtures";
import { SUPPORT_EMAIL, SentNotice, type Step, buildSteps } from "./steps";

/**
 * Every intake screen side by side, inert. Each step frame is the right-hand
 * column of the live form at that step; the welcome panel beside it on
 * desktop gets one frame of its own rather than repeating in all of them.
 */
export function IntakeLab({ scenario }: { scenario: Scenario }) {
  const data = scenarioData(scenario);
  const steps = buildSteps(
    data.prefill,
    data.listings,
    data.answers,
    data.setup,
  );

  const frames: {
    id: string;
    caption: string;
    gate?: boolean;
    /** Growth's own pages run on growth's dark theme and need desktop width. */
    growth?: boolean;
    node: React.ReactNode;
  }[] = [
    {
      id: "welcome",
      caption: "Welcome panel",
      node: <WelcomePanel brand={data.prefill.brand} />,
    },
    ...steps.map((step, index) => ({
      id: `step-${index + 1}`,
      caption: `${index + 1} · ${step.label}`,
      gate: index < steps.length - 1 ? step.complete : undefined,
      node: <StepFrame step={step} index={index} total={steps.length} />,
    })),
    {
      id: "sent",
      caption: "After sending",
      node: (
        <StepFrame
          step={{ ...steps[steps.length - 1]!, body: null }}
          index={steps.length - 1}
          total={steps.length}
          body={<SentNotice repName={data.prefill.repName} />}
        />
      ),
    },
    { id: "inactive", caption: "Inactive link", node: <InactiveLink /> },
    ...CONNECT_STATES.map((state) => ({
      id: state.id,
      caption: state.caption,
      growth: true,
      node: <ConnectView {...state.props} />,
    })),
    {
      id: "connect-inactive",
      caption: "Connect · inactive link",
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
            "About five minutes, mostly single taps",
            "One link at the end connects your accounts",
            "Your launch plan comes back within two business days",
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
