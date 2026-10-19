"use client";

/**
 * What the intake link shows once the brand section is sent: a hub of
 * sections, each reading its status from the record that owns it. Nothing
 * here is a draft. Connections are brand channels, the email domain is
 * `emailSender.marketingDomain`, and preferences are ordinary edits, so a
 * client can leave and come back to any of them in any order.
 */

import { Button } from "@wandercom/design-system-web/ui/button";
import { Input } from "@wandercom/design-system-web/ui/input";

import {
  EMAIL_PROGRAMS,
  EMAIL_TOOLS,
  type ConnectionRow,
  type EmailDomainState,
  type EmailPreferences,
  type EmailProgram,
  type IntakeAnswers,
  type IntakeSetup,
  type ScenarioData,
  META_ACCOUNTS,
} from "./fixtures";
import { Check, Chip, Field } from "./steps";

type SectionState = "done" | "partial" | "todo" | "optional";

const STATE_TEXT: Record<SectionState, string> = {
  done: "Done",
  partial: "In progress",
  todo: "To do",
  optional: "Optional",
};

const STATE_CLASS: Record<SectionState, string> = {
  done: "border-emerald-600/30 text-emerald-700",
  partial: "border-amber-500/40 text-amber-600",
  todo: "border-border-secondary text-primary",
  optional: "border-border-secondary text-secondary",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export function sectionStates(data: ScenarioData) {
  const ads = data.connections.filter((row) => row.group === "ads");
  const adsConnected = ads.filter((row) => row.connected).length;
  return {
    brand: (data.sentAt ? "done" : "todo") as SectionState,
    connect: (adsConnected === ads.length
      ? "done"
      : adsConnected > 0
        ? "partial"
        : "todo") as SectionState,
    email: (data.emailPreferences.saved ? "done" : "optional") as SectionState,
  };
}

// ---- hub --------------------------------------------------------------

export function Hub({ data }: { data: ScenarioData }) {
  const states = sectionStates(data);
  const connected = data.connections.filter((row) => row.connected);
  const rows: {
    title: string;
    detail: string;
    state: SectionState;
    action: string;
  }[] = [
    {
      title: "About your brand",
      detail: data.sentAt
        ? `Sent ${formatDate(data.sentAt)}. ${data.prefill.repName ?? "Your Wander contact"} is on your launch plan.`
        : "Homes, budget, photos and your guest list.",
      state: states.brand,
      action: data.sentAt ? "See what you sent" : "Start",
    },
    {
      title: "Accounts for ads",
      detail: connected.length
        ? `${connected.map((row) => row.label).join(", ")} connected.`
        : "Meta and Google so we can run your ads. Instagram and Facebook so the ads run as you.",
      state: states.connect,
      action: states.connect === "done" ? "Review" : "Connect",
    },
    {
      title: "Email",
      detail: data.emailPreferences.saved
        ? `${data.emailPreferences.programs.map((key) => EMAIL_PROGRAMS[key].label).join(", ")}. Sent October 16.`
        : "What we send your guests, where replies go and how offers work. Its own send, whenever suits you.",
      state: states.email,
      action: data.emailPreferences.saved ? "Update" : "Set up",
    },
  ];

  return (
    <section className="flex h-full flex-col px-6 py-8">
      <p className="text-xs font-medium tracking-wide text-secondary uppercase">
        {data.prefill.brand}
      </p>
      <h1 className="mt-3 text-2xl leading-tight font-semibold tracking-tight">
        {data.sentAt ? "Your setup" : "Let's get you set up"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        Do these in any order and come back to this link to finish. The first
        one is all we need to start.
      </p>
      <ol className="mt-6 divide-y divide-border-primary rounded-xl border border-border-secondary">
        {rows.map((row, index) => (
          <li key={row.title} className="flex items-start gap-3 px-4 py-4">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border-secondary text-[11px] font-medium text-secondary">
              {row.state === "done" ? "✓" : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium">{row.title}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${STATE_CLASS[row.state]}`}
                >
                  {STATE_TEXT[row.state]}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-secondary">
                {row.detail}
              </p>
              <Button
                variant={
                  row.state === "done" || row.state === "optional"
                    ? "secondary"
                    : "primary"
                }
                size="sm"
                className="mt-3"
                disabled={index > 0 && !data.sentAt}
              >
                {row.action}
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- receipt ----------------------------------------------------------

export function Receipt({
  answers: a,
  sentAt,
  repName,
}: {
  answers: IntakeAnswers;
  sentAt: string;
  repName: string | null;
}) {
  const rows: [string, string][] = [
    ["Booking site", a.detailsConfirmed ? "Confirmed" : "Not confirmed"],
    ["Monthly report to", a.reportEmails || "You"],
    [
      "Homes",
      a.allProperties ? "All of them" : `${a.propertyUrls.length} selected`,
    ],
    ["About those homes", a.propertyNotes || "Nothing added"],
    ["Monthly ad budget", a.budget || "Not set"],
    ["Invoices to", a.invoiceEmail || "You"],
    ["Photos and video", a.creativeDriveUrl || "No link"],
    [
      "Guest list",
      a.guestListDriveUrl
        ? `${a.guestListDriveUrl}${a.guestConsent ? " · consent confirmed" : ""}`
        : "No link",
    ],
    ["Anything else", a.anythingElse || "Nothing added"],
  ];
  return (
    <SectionFrame
      eyebrow="About your brand"
      title={`What you sent on ${formatDate(sentAt)}`}
      help={`To change any of this, tell ${repName ?? "your Wander contact"}. A sent intake is kept as you sent it.`}
    >
      <dl className="divide-y divide-border-primary rounded-xl border border-border-secondary text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="space-y-0.5 px-4 py-2.5">
            <dt className="text-xs text-secondary">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </SectionFrame>
  );
}

// ---- ads and social ---------------------------------------------------

export function ConnectSection({
  connections,
  setup,
  metaChosen,
}: {
  connections: ConnectionRow[];
  setup: IntakeSetup;
  /** Once chosen, the account shows as a summary with Change, like /connect (#716). */
  metaChosen: boolean;
}) {
  const groups = [
    {
      key: "ads",
      title: "Ad accounts",
      hint: "Where the ads run and the spend is billed.",
    },
    {
      key: "social",
      title: "Social accounts for ads",
      hint: "So ads show your brand’s name and photo.",
    },
  ] as const;
  const chosen = META_ACCOUNTS[0]!;

  return (
    <SectionFrame
      eyebrow="Accounts for ads"
      title="Give us access"
      help="Each button opens the platform's own sign-in. You stay the owner of everything and can revoke our access any time."
    >
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">{group.title}</h3>
            <p className="text-xs text-secondary">{group.hint}</p>
          </div>
          <ul className="divide-y divide-border-primary rounded-xl border border-border-secondary">
            {connections
              .filter((row) => row.group === group.key)
              .map((row) => (
                <li key={row.key} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="truncate text-xs text-secondary">
                        {row.connected ? row.account : "Not connected"}
                      </p>
                    </div>
                    {row.connected ? (
                      <span className="text-xs text-emerald-700">
                        Connected
                      </span>
                    ) : (
                      <Button variant="secondary" size="sm">
                        Connect
                      </Button>
                    )}
                  </div>
                  {row.key === "meta-ads" && row.connected && (
                    <div className="mt-4 space-y-4 border-t border-border-primary pt-4">
                      {metaChosen ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 text-sm">
                            <p className="text-xs text-secondary">Ad account</p>
                            <p className="font-medium">{chosen.name}</p>
                            <p className="truncate text-xs text-secondary">
                              {[chosen.businessName, chosen.id, chosen.currency]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <Button variant="secondary" size="sm">
                            Change
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm font-medium">
                            Which ad account should we use?
                          </p>
                          {META_ACCOUNTS.map((account, index) => (
                            <div
                              key={account.id}
                              className={`rounded-xl border px-4 py-3 text-sm ${
                                index === 0
                                  ? "border-primary"
                                  : "border-border-secondary"
                              } ${account.selectable ? "" : "opacity-60"}`}
                            >
                              <p className="font-medium">{account.name}</p>
                              <p className="text-xs text-secondary">
                                {[
                                  account.businessName,
                                  account.id,
                                  account.currency,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {account.reason && (
                                <p className="mt-1 text-xs">{account.reason}</p>
                              )}
                            </div>
                          ))}
                          <Button variant="primary" size="sm">
                            Use this account
                          </Button>
                        </div>
                      )}
                      <ul className="space-y-3">
                        {setup.checks
                          .filter((item) =>
                            ["meta", "billing", "pixel"].includes(item.key),
                          )
                          .map((item) => (
                            <li key={item.key} className="text-sm">
                              <p className="font-medium">
                                {item.label}: {CHECK_LABELS[item.state]}
                              </p>
                              <p className="mt-1 text-xs text-secondary">
                                {item.detail}
                              </p>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </SectionFrame>
  );
}

const CHECK_LABELS = {
  ready: "Ready",
  action_required: "Action needed",
  pending: "Wander is finishing setup",
  unknown: "Not verified",
};

// ---- email -------------------------------------------------------------

/**
 * The last section and its own send: what we may email, where replies go,
 * how offers work. The sending domain sits under it because it is optional
 * and technical, and checks itself rather than being sent.
 */
export function EmailSection({
  prefs: p,
  domain,
}: {
  prefs: EmailPreferences;
  domain: EmailDomainState;
}) {
  const verified = domain.state === "verified";
  return (
    <SectionFrame
      eyebrow="Email"
      title="How should we email your guests?"
      help="Pick what fits and send it over. To change anything later, send it again or tell your Wander contact."
    >
      <div className="space-y-2">
        {(Object.keys(EMAIL_PROGRAMS) as EmailProgram[]).map((key) => (
          <div
            key={key}
            className={`rounded-xl border px-4 py-3 ${
              p.programs.includes(key)
                ? "border-primary"
                : "border-border-secondary"
            }`}
          >
            <Check
              checked={p.programs.includes(key)}
              onChange={() => undefined}
              label={EMAIL_PROGRAMS[key].label}
            />
            <p className="mt-1 pl-6.5 text-xs leading-relaxed text-secondary">
              {EMAIL_PROGRAMS[key].detail}
            </p>
          </div>
        ))}
      </div>

      <Field label="Where should guest replies go?" required>
        <Input type="email" value={p.replyTo} onChange={() => undefined} />
      </Field>

      <Field label="Discounts in offers">
        <div className="flex flex-wrap gap-2">
          <Chip active={p.discount === "ask"}>Ask me every time</Chip>
          <Chip active={p.discount === "cap"}>Up to a limit</Chip>
        </div>
      </Field>
      {p.discount === "cap" && (
        <Field
          label="Most you will take off a stay"
          required
          hint="We never offer more than this without asking."
        >
          <Input
            inputMode="numeric"
            placeholder="$ per stay"
            value={p.discountCapDollars ? `$${p.discountCapDollars}` : ""}
            onChange={() => undefined}
          />
        </Field>
      )}

      <Field
        label="Which email tool do you use today?"
        optional
        hint="So we can bring your subscribers over and not email anyone twice."
      >
        <div className="flex flex-wrap gap-2">
          {EMAIL_TOOLS.map((tool) => (
            <Chip key={tool} active={p.emailTool === tool}>
              {tool}
            </Chip>
          ))}
        </div>
      </Field>

      <Button variant="primary" size="md" className="w-full">
        {p.saved ? "Send update" : "Send"}
      </Button>
      {p.saved && <p className="text-xs text-secondary">Sent October 16.</p>}

      <div className="space-y-4 border-t border-border-secondary pt-6">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className="font-medium">Send from your own domain</h3>
            <span className="text-[11px] text-secondary">Optional</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-secondary">
            {verified
              ? `Guest email goes out from ${domain.sendingDomain}.`
              : `We send from ${domain.sendingDomain}, a subdomain kept apart from your website and your own inbox. Until it is set up, emails send from Wander with replies coming to you.`}
          </p>
        </div>
        {!verified && (
          <Button variant="secondary" size="md" className="w-full">
            Connect my DNS provider
          </Button>
        )}
        <details
          className="rounded-xl border border-border-secondary"
          open={domain.state === "waiting"}
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            {verified ? "Records" : "Or add the records yourself"}
          </summary>
          <ul className="divide-y divide-border-primary border-t border-border-primary text-xs">
            {domain.records.map((record) => (
              <li key={record.host} className="space-y-1 px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{record.type}</span>
                  <span className="text-secondary">TTL {record.ttl}</span>
                </div>
                <p className="font-mono break-all">{record.host}</p>
                <p className="font-mono break-all text-secondary">
                  {record.value}
                </p>
              </li>
            ))}
          </ul>
        </details>
        <ul className="space-y-2 text-sm">
          {(
            [
              ["Signing (DKIM)", domain.dkimVerified],
              ["Bounces (Return-Path)", domain.returnPathVerified],
            ] as const
          ).map(([label, ok]) => (
            <li key={label} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className={ok ? "text-emerald-700" : "text-secondary"}>
                {ok
                  ? "Verified"
                  : domain.state === "waiting"
                    ? "Waiting for DNS"
                    : "Not added"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SectionFrame>
  );
}

// ---- frame ------------------------------------------------------------

function SectionFrame({
  eyebrow,
  title,
  help,
  children,
}: {
  eyebrow: string;
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col px-6 py-8">
      <div className="flex items-baseline justify-between text-xs text-secondary">
        <span className="font-medium tracking-wide uppercase">{eyebrow}</span>
        <span>← Your setup</span>
      </div>
      <h1 className="mt-6 text-2xl leading-tight font-semibold tracking-tight">
        {title}
      </h1>
      {help && (
        <p className="mt-2 text-sm leading-relaxed text-secondary">{help}</p>
      )}
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  );
}
