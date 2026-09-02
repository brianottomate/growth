"use client";

import { useEffect, useMemo, useState } from "react";
import { Logo } from "@wandercom/design-system-web/ui/logo";

export type IntakeSeed = {
  brand: string;
  contact: string;
  email: string;
  site: string;
  properties: string[] | null;
  leadsieUrl: string;
  repName: string;
  repEmail: string;
};

const MANAGEMENT_FEE = "$2,500";
const BUDGET_PRESETS = ["$2,000", "$3,000", "$5,000", "$7,500", "$10,000"];

type Answers = {
  detailsConfirmed: boolean;
  detailsCorrection: string;
  reportEmails: string;
  properties: string[];
  propertyNotes: string;
  budget: string;
  budgetFlexible: "" | "fixed" | "flexible";
  billingAcknowledged: boolean;
  invoiceEmail: string;
  guestConsent: boolean;
  ugcPermission: "" | "yes" | "unsure" | "no";
  avoid: string;
  anythingElse: string;
  instagramLinked: boolean;
  accountsConnected: boolean;
};

const EMPTY: Answers = {
  detailsConfirmed: false,
  detailsCorrection: "",
  reportEmails: "",
  properties: [],
  propertyNotes: "",
  budget: "",
  budgetFlexible: "",
  billingAcknowledged: false,
  invoiceEmail: "",
  guestConsent: false,
  ugcPermission: "",
  avoid: "",
  anythingElse: "",
  instagramLinked: false,
  accountsConnected: false,
};

const DRAFT_KEY = "wander-intake-draft-v1";

/**
 * The client-facing Performance+ intake. Same shape as /connect/[token]: a
 * public page with Wander's half on the left and the task on the right, task
 * first on mobile.
 *
 * Stepped rather than one long scroll, because this gets filled in live on a
 * call and one question at a time keeps both people looking at the same
 * thing. When there is no token the form submits nowhere and the last step
 * renders the answers as text to copy, which is what makes a preview link
 * useful without minting one against a real client.
 */
export function IntakeForm({
  seed,
  token,
}: {
  seed: IntakeSeed;
  /** Null in preview mode: the form runs but submits nowhere. */
  token: string | null;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [restored, setRestored] = useState(false);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((current) => ({ ...current, [key]: value }));

  // A tab reload mid-call should not cost the answers already given. Per
  // browser, never sent anywhere, and every access is guarded because some
  // contexts throw on the accessor itself rather than returning null.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY);
      if (saved) setAnswers({ ...EMPTY, ...(JSON.parse(saved) as Answers) });
    } catch {
      // no draft, or storage unavailable
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
    } catch {
      // storage unavailable; the form still works
    }
  }, [answers, restored]);

  const steps = useMemo(
    () => buildSteps(seed, answers, set, token),
    // `set` only closes over setAnswers, so seed + answers are the real inputs.
    [seed, answers, token],
  );

  const current = steps[step]!;
  const isLast = step === steps.length - 1;
  const canAdvance = current.complete;

  return (
    <main className="flex min-h-screen flex-col lg:grid lg:grid-cols-[minmax(0,26rem)_1fr]">
      {/* Wander's half. Renders below the task on a phone. */}
      <aside className="order-2 flex flex-col justify-between gap-10 border-t px-6 py-10 lg:order-1 lg:min-h-screen lg:border-t-0 lg:border-r lg:px-10 lg:py-12">
        <div>
          <Logo variant="wordmark" className="h-5 w-auto" />
          <Logo
            variant="logomark"
            aria-hidden
            className="mt-10 hidden h-14 w-auto opacity-90 lg:block"
          />
          <h2 className="mt-8 text-2xl leading-tight font-semibold tracking-tight">
            Your ads,
            <br />
            run by Wander.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            We built {seed.brand}&apos;s booking site, so we already have your
            rates, your availability and your photography. This form is the
            handful of things we can&apos;t look up ourselves.
          </p>
          <ol className="mt-8 space-y-4">
            {[
              "About five minutes, mostly single taps",
              "One link at the end connects your accounts",
              "Your launch plan comes back within two business days",
            ].map((line, index) => (
              <li key={line} className="flex gap-3">
                <span className="border-border text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-medium">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed">{line}</span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground mt-8 text-xs leading-relaxed">
            No kickoff call to schedule. Questions before you start?{" "}
            <a href={`mailto:${seed.repEmail}`} className="underline">
              {seed.repEmail}
            </a>
          </p>
        </div>
        <p className="text-muted-foreground text-xs">Find your happy place ®</p>
      </aside>

      <section className="order-1 px-6 py-10 lg:order-2 lg:px-12 lg:py-16">
        <div className="mx-auto flex w-full max-w-lg flex-col">
          <ProgressHeader
            step={step}
            total={steps.length}
            label={current.label}
          />

          <div className="mt-8 min-h-[22rem]">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight">
              {current.title}
            </h1>
            {current.help && (
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {current.help}
              </p>
            )}
            <div className="mt-6 space-y-5">{current.body}</div>
          </div>

          <div className="mt-8 flex items-center gap-3 border-t pt-6">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((n) => n - 1)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                Back
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                disabled={!canAdvance}
                onClick={() => setStep((n) => n + 1)}
                className="ml-auto rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-black/50"
              >
                {step === 0 ? "Start" : "Next"}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function ProgressHeader({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground flex items-baseline justify-between text-xs">
        <span className="font-medium tracking-wide uppercase">{label}</span>
        <span className="tabular-nums">
          {step + 1} / {total}
        </span>
      </div>
      <div className="bg-muted mt-2 h-1 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-300"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ---- steps ------------------------------------------------------------

type Step = {
  label: string;
  title: string;
  help?: string;
  body: React.ReactNode;
  /** Whether every required field on this step has an answer. */
  complete: boolean;
};

function buildSteps(
  seed: IntakeSeed,
  a: Answers,
  set: <K extends keyof Answers>(key: K, value: Answers[K]) => void,
  token: string | null,
): Step[] {
  const seededProperties = seed.properties ?? [];

  return [
    {
      label: "Your details",
      title: "Is this still right?",
      help: "Pulled from your Wander account. Tell us anything that's out of date.",
      complete: a.detailsConfirmed,
      body: (
        <>
          <div className="bg-card rounded-xl border p-4 text-sm">
            <p className="font-medium">{seed.brand}</p>
            <p className="text-muted-foreground mt-1">
              {seed.contact} · {seed.email} · {seed.site}
            </p>
          </div>
          <Check
            checked={a.detailsConfirmed}
            onChange={(v) => set("detailsConfirmed", v)}
            label="That's all correct"
            required
          />
          <Field label="Anything out of date?" optional>
            <textarea
              rows={2}
              value={a.detailsCorrection}
              onChange={(e) => set("detailsCorrection", e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </Field>
          <Field
            label="Anyone else who should get the monthly report?"
            optional
            hint="Separate emails with a comma"
          >
            <input
              value={a.reportEmails}
              onChange={(e) => set("reportEmails", e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            />
          </Field>
        </>
      ),
    },
    {
      label: "Properties",
      title: "Which properties should we advertise?",
      help:
        seededProperties.length > 0
          ? "Pulled from your booking site. Tick the ones you want ads running for."
          : "Add the properties you want ads running for.",
      complete: a.properties.length > 0,
      body: (
        <>
          <PropertyPicker
            seeded={seededProperties}
            selected={a.properties}
            onChange={(next) => set("properties", next)}
          />
          <Field
            label="Anything we should know about those?"
            optional
            hint="One coming offline for renovation, one you're pushing harder this season, anything that changes how we'd treat it."
          >
            <textarea
              rows={3}
              value={a.propertyNotes}
              onChange={(e) => set("propertyNotes", e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </Field>
        </>
      ),
    },
    {
      label: "Budget",
      title: "What's your monthly ad budget?",
      help: `This is the money that goes to Meta and Google. It's separate from the ${MANAGEMENT_FEE} management fee.`,
      complete: Boolean(a.budget.trim()) && a.budgetFlexible !== "",
      body: (
        <>
          <div className="flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((preset) => (
              <Chip
                key={preset}
                active={a.budget === preset}
                onClick={() => set("budget", preset)}
              >
                {preset}
              </Chip>
            ))}
            <Chip
              active={a.budget === "recommend"}
              onClick={() => set("budget", "recommend")}
            >
              Tell me what you&apos;d recommend
            </Chip>
          </div>
          <Field label="Or another amount" optional>
            <input
              inputMode="numeric"
              placeholder="$ per month"
              value={
                a.budget.startsWith("$") || a.budget === "recommend"
                  ? ""
                  : a.budget
              }
              onChange={(e) => set("budget", e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            />
          </Field>
          <Field label="Is that fixed, or can it move if it's working?" required>
            <Radio
              name="flex"
              value={a.budgetFlexible}
              onChange={(v) => set("budgetFlexible", v as Answers["budgetFlexible"])}
              options={[
                { value: "fixed", label: "Fixed for now" },
                {
                  value: "flexible",
                  label: "Can increase if the numbers support it",
                },
              ]}
            />
          </Field>
        </>
      ),
    },
    {
      label: "Billing",
      title: "How ad spend works",
      complete: a.billingAcknowledged,
      body: (
        <>
          <div className="bg-card space-y-3 rounded-xl border p-4 text-sm leading-relaxed">
            <p>
              We invoice you for your ad budget at the start of each month and
              run it from there, so you can never be charged more than
              you&apos;ve approved. Anything unspent rolls into the next month.
            </p>
            <p>
              If you want to increase mid-month because things are working,
              we&apos;ll send a top-up invoice and it&apos;s live the same day.
            </p>
            <p className="text-muted-foreground">
              This is separate from the {MANAGEMENT_FEE} management fee, which
              is billed on its own.
            </p>
          </div>
          <Check
            checked={a.billingAcknowledged}
            onChange={(v) => set("billingAcknowledged", v)}
            label="Got it. Ad spend is invoiced monthly in advance, separate from the management fee."
            required
          />
          <Field
            label="Should invoices go somewhere else?"
            optional
            hint="A bookkeeper, an owner, or an accounts inbox."
          >
            <input
              value={a.invoiceEmail}
              onChange={(e) => set("invoiceEmail", e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            />
          </Field>
        </>
      ),
    },
    {
      label: "Past guests",
      title: "Your past guests",
      help: "No export needed. Your booking site already holds this, so we build the list ourselves.",
      complete: a.guestConsent,
      body: (
        <>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We use it two ways: to find more people who look like your best
            guests, and to stop spending money advertising to people who have
            already stayed with you. Handled securely, never shared, never
            sold.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Meta requires the advertiser to confirm this before we can build an
            audience from it, so we need this one from you.
          </p>
          <Check
            checked={a.guestConsent}
            onChange={(v) => set("guestConsent", v)}
            label="These guests booked with us and agreed to hear from us, and Wander may use their details to build ad audiences."
            required
          />
        </>
      ),
    },
    {
      label: "Creative",
      title: "Creative",
      help: "We build the ads themselves from your booking site: your photography, your homes, your logo. One question here.",
      complete: a.ugcPermission !== "",
      body: (
        <Field
          label="Do you have guest or creator content you're allowed to use in ads?"
          required
          hint="Reels, tagged photos, anything a creator made for you. With permission, it usually outperforms everything else we make."
        >
          <Radio
            name="ugc"
            value={a.ugcPermission}
            onChange={(v) => set("ugcPermission", v as Answers["ugcPermission"])}
            options={[
              { value: "yes", label: "Yes, and I have permission" },
              { value: "unsure", label: "Yes, but I'm not sure about permission" },
              { value: "no", label: "No" },
            ]}
          />
        </Field>
      ),
    },
    {
      label: "Anything to avoid",
      title: "Is there anything we shouldn't say or show?",
      help: "An award you can't claim any more, a pet policy that changed, a view that's now blocked by construction, a hot tub that's out of service. Small things, but they cost us money when we find out from a guest.",
      complete: true,
      body: (
        <>
          <Field label="Things to avoid" optional>
            <textarea
              rows={3}
              value={a.avoid}
              onChange={(e) => set("avoid", e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Anything else we should know?" optional>
            <textarea
              rows={3}
              value={a.anythingElse}
              onChange={(e) => set("anythingElse", e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </Field>
        </>
      ),
    },
    {
      label: "Connect",
      title: "Last step, and it's one click",
      help: "This link lets us run ads from your Instagram and Facebook handles and manage your Google account. You stay the owner of everything, you can revoke our access any time, and we never get your password.",
      complete: a.instagramLinked && a.accountsConnected,
      body: (
        <>
          <a
            href={seed.leadsieUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => set("accountsConnected", true)}
            className="block rounded-md bg-white px-4 py-2.5 text-center text-sm font-medium text-black transition-colors hover:bg-white/85"
          >
            Connect my accounts
          </a>
          <p className="text-muted-foreground text-xs">
            Requests: Facebook Page · Instagram · Google Ads · Google Analytics
          </p>
          <Check
            checked={a.instagramLinked}
            onChange={(v) => set("instagramLinked", v)}
            label="My Instagram account is connected to my Facebook Page."
            required
          />
          {token && <AccessCheck token={token} brandName={seed.brand} />}
          <details className="text-muted-foreground text-xs leading-relaxed">
            <summary className="cursor-pointer underline">
              How do I check?
            </summary>
            <p className="mt-2">
              Open Meta Business Suite, go to Settings, then Accounts, then
              Instagram accounts. If your account is listed there and shows your
              Facebook Page next to it, you&apos;re set. If it isn&apos;t, click
              Connect and log in. It takes about a minute.
            </p>
            <p className="mt-2">
              Not seeing it? Send us a note and we&apos;ll walk you through it.
              It&apos;s a common one.
            </p>
          </details>
          <Check
            checked={a.accountsConnected}
            onChange={(v) => set("accountsConnected", v)}
            label="I've granted access."
            required
          />
        </>
      ),
    },
    {
      label: "Done",
      title: "That's everything",
      help: `${seed.repName} takes it from here. Your launch plan comes back within two business days.`,
      complete: true,
      body: <Summary seed={seed} answers={a} token={token} />,
    },
  ];
}

// ---- pieces -----------------------------------------------------------

function Field({
  label,
  children,
  hint,
  optional,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  optional?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {optional && (
          <span className="text-muted-foreground text-[11px]">Optional</span>
        )}
        {required && (
          <span className="text-[11px] text-amber-400/80">Required</span>
        )}
      </div>
      {hint && (
        <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>
      )}
      {children}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  required,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-white"
      />
      <span>
        {label}
        {required && !checked && (
          <span className="ml-1.5 text-[11px] text-amber-400/80">Required</span>
        )}
      </span>
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-white bg-white text-black"
          : "border-border hover:border-foreground/40"
      }`}
    >
      {children}
    </button>
  );
}

function Radio({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2.5 text-sm"
        >
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-4 accent-white"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/**
 * Seeded properties are ticked; anything else the client types is added to
 * the same list. The real version fills `seeded` from their WanderOS site,
 * so typing is the fallback rather than the path.
 */
function PropertyPicker({
  seeded,
  selected,
  onChange,
}: {
  seeded: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const options = useMemo(
    () => [...seeded, ...selected.filter((name) => !seeded.includes(name))],
    [seeded, selected],
  );

  const toggle = (name: string) =>
    onChange(
      selected.includes(name)
        ? selected.filter((row) => row !== name)
        : [...selected, name],
    );

  const add = () => {
    const name = draft.trim();
    if (!name || selected.includes(name)) return;
    onChange([...selected, name]);
    setDraft("");
  };

  return (
    <div className="space-y-3">
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip
            active={options.length > 0 && selected.length === options.length}
            onClick={() =>
              onChange(selected.length === options.length ? [] : options)
            }
          >
            All of them
          </Chip>
          {options.map((name) => (
            <Chip
              key={name}
              active={selected.includes(name)}
              onClick={() => toggle(name)}
            >
              {name}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          placeholder="Add a property"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="border-border rounded-md border px-3 text-sm"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * The stand-in for a backend. Renders the answers as plain text so whoever
 * ran the call can paste them into Slack or a ticket until there is a table
 * to write them to.
 */
function Summary({
  seed,
  answers,
  token,
}: {
  seed: IntakeSeed;
  answers: Answers;
  token: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const text = useMemo(() => summaryText(seed, answers), [seed, answers]);

  const submit = async () => {
    if (!token) return;
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Something went wrong on our end.");
      }
      // The draft exists to survive a reload mid-form. Once it is filed, a
      // stale copy would repopulate the next person on a shared machine.
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // storage unavailable
      }
      setState("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div className="bg-card space-y-2 rounded-xl border p-5">
        <p className="text-sm font-medium">Sent. Nothing else needed from you.</p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {seed.repName} has everything and your launch plan comes back within
          two business days. If anything changes on your side, a property coming
          offline or new photography, just send it over.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <pre className="bg-card max-h-72 overflow-auto rounded-xl border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        {token ? (
          <button
            type="button"
            disabled={state === "sending"}
            onClick={() => void submit()}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/85 disabled:bg-white/40 disabled:text-black/50"
          >
            {state === "sending" ? "Sending…" : "Send it in"}
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">
            Preview link. This form has nowhere to submit to.
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="border-border rounded-md border px-4 py-2 text-sm"
        >
          {copied ? "Copied" : "Copy answers"}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

function summaryText(seed: IntakeSeed, a: Answers): string {
  const lines: (string | null)[] = [
    `Performance+ intake for ${seed.brand}`,
    `Contact: ${seed.contact} <${seed.email}> · ${seed.site}`,
    "",
    `Details confirmed: ${a.detailsConfirmed ? "yes" : "no"}`,
    a.detailsCorrection ? `Corrections: ${a.detailsCorrection}` : null,
    a.reportEmails ? `Also report to: ${a.reportEmails}` : null,
    "",
    `Properties (${a.properties.length}): ${a.properties.join(", ") || "none"}`,
    a.propertyNotes ? `Property notes: ${a.propertyNotes}` : null,
    "",
    `Monthly ad budget: ${a.budget === "recommend" ? "asked for a recommendation" : a.budget || "not set"}`,
    `Budget flexibility: ${a.budgetFlexible || "not set"}`,
    `Billing acknowledged: ${a.billingAcknowledged ? "yes" : "no"}`,
    a.invoiceEmail ? `Invoices to: ${a.invoiceEmail}` : null,
    "",
    `Guest-audience consent: ${a.guestConsent ? "given" : "not given"}`,
    `Guest/creator content: ${a.ugcPermission || "not set"}`,
    "",
    a.avoid ? `Avoid: ${a.avoid}` : null,
    a.anythingElse ? `Other notes: ${a.anythingElse}` : null,
    "",
    `Instagram linked to Page: ${a.instagramLinked ? "confirmed" : "not confirmed"}`,
    `Accounts connected: ${a.accountsConnected ? "confirmed" : "not confirmed"}`,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

/**
 * "Did that work?" after the client returns from the grant screen.
 *
 * On demand rather than polling: the wait happens in another tab, each check
 * reaches Zernio and then Meta, and a spinner that has run for ninety seconds
 * reads as broken where a button that says "not yet, try again" does not.
 *
 * Never blocks. A grant can be real and not visible to us yet, and someone who
 * did their part must be able to finish the form regardless. We resolve any
 * disagreement on our side.
 */
function AccessCheck({ token, brandName }: { token: string; brandName: string }) {
  const [state, setState] = useState<
    "idle" | "checking" | "found" | "waiting" | "throttled"
  >("idle");
  const [pageName, setPageName] = useState<string | null>(null);

  const check = async () => {
    setState("checking");
    try {
      const response = await fetch("/api/intake/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as {
        found?: boolean;
        pageName?: string | null;
        throttled?: boolean;
      };
      if (data.throttled) {
        setState("throttled");
      } else if (data.found) {
        setPageName(data.pageName ?? null);
        setState("found");
      } else {
        setState("waiting");
      }
    } catch {
      setState("waiting");
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={state === "checking"}
        onClick={() => void check()}
        className="border-border rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
      >
        {state === "checking" ? "Checking…" : "Check that it worked"}
      </button>
      {state === "found" && (
        <p className="text-xs text-emerald-400">
          Found {pageName ?? brandName}. You&apos;re connected.
        </p>
      )}
      {state === "waiting" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Not seeing it yet. That is usually just a delay on Meta&apos;s side.
          Carry on and finish. We&apos;ll confirm from our end.
        </p>
      )}
      {state === "throttled" && (
        <p className="text-muted-foreground text-xs">
          Give it a few seconds and try again.
        </p>
      )}
    </div>
  );
}
