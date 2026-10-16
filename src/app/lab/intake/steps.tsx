"use client";

/**
 * A copy of the Performance+ intake steps from wander.com, rendered read-only.
 *
 * Source: wandercom/wander.com
 *   src/app/(marketing)/internal/intake/[handle]/IntakeForm.tsx
 *   src/features/intake/IntakeSetupCheck.tsx
 * Ported from dev at 047911505c (2026-10-16). Copy and wording are verbatim;
 * wander.com's theme aliases (`text-content-*`, `text-default`) are swapped
 * for the tokens growth defines. Re-sync by hand when the form changes.
 *
 * Kept out: the localStorage draft, step navigation, the submit request and
 * the live setup check. The lab shows every step at once from fixtures.
 */

import { Button } from "@wandercom/design-system-web/ui/button";
import { Checkbox } from "@wandercom/design-system-web/ui/checkbox";
import { Input } from "@wandercom/design-system-web/ui/input";
import { Textarea } from "@wandercom/design-system-web/ui/textarea";
import type {
  IntakeAnswers as Answers,
  IntakeListing,
  IntakePrefill,
  IntakeSetup,
} from "./fixtures";

const BUDGET_PRESETS = ["$2,500", "$5,000", "$10,000", "$20,000"];
const MIN_PER_PROPERTY = 200;
export const SUPPORT_EMAIL = "performance@wander.com";

export type Step = {
  label: string;
  title: string;
  help?: string;
  body: React.ReactNode;
  complete: boolean;
};

/** Read-only: every handler in the copied markup lands here. */
const noop = () => undefined;

export function buildSteps(
  prefill: IntakePrefill,
  listings: { supported: boolean; listings: IntakeListing[] },
  a: Answers,
  setup: IntakeSetup | null,
): Step[] {
  const set = noop as <K extends keyof Answers>(
    key: K,
    value: Answers[K],
  ) => void;
  return [
    {
      label: "Your details",
      title: "First let's confirm your direct booking site",
      complete: a.detailsConfirmed,
      body: (
        <>
          <div className="rounded-xl border border-border-secondary p-4 text-sm">
            <p className="font-medium">{prefill.brand}</p>
            {prefill.site && (
              <p className="mt-1 text-secondary">{prefill.site}</p>
            )}
          </div>
          <Check
            checked={a.detailsConfirmed}
            onChange={(v) => set("detailsConfirmed", v)}
            label="That's correct"
            required
          />
          <Field
            label="Who should receive the monthly performance report?"
            optional
            hint="Separate emails with a comma"
          >
            <Input
              value={a.reportEmails}
              onChange={(e) => set("reportEmails", e.target.value)}
            />
          </Field>
        </>
      ),
    },
    {
      label: "Properties",
      title: "Which homes should we advertise?",
      help: "Aim for five to ten.",
      complete: a.allProperties || a.propertyUrls.length > 0,
      body: (
        <>
          <p className="text-sm leading-relaxed text-secondary">
            This is your chance to feature the homes that best represent your
            brand, the ones with your strongest owner relationships, and the
            ones you most want booked. Guests who land on your site search
            around from there and book others, so the ad&apos;s job is getting
            them through the door rather than covering every listing.
          </p>
          <PropertyPicker
            listings={listings.listings}
            supported={listings.supported}
            selected={a.propertyUrls}
            all={a.allProperties}
          />
          <Field
            label="Anything we should know about those?"
            optional
            hint="One coming offline for renovation, one you are pushing harder this season, anything that changes how we would treat it."
          >
            <Textarea
              rows={3}
              value={a.propertyNotes}
              onChange={(e) => set("propertyNotes", e.target.value)}
            />
          </Field>
        </>
      ),
    },
    {
      label: "Budget",
      title: "Let's set your ad budget for the first month",
      help: "Set your budget for ads. We recommend starting with at least $2,500 a month. We will not exceed it and you will be billed at the end of the month.",
      complete: Boolean(a.budget.trim()) && a.billingAcknowledged,
      body: (
        <>
          <div className="flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((preset) => (
              <Chip key={preset} active={a.budget === preset}>
                {preset}
              </Chip>
            ))}
            <Chip active={a.budget === "recommend"}>
              Tell me what you&apos;d recommend
            </Chip>
          </div>
          <Field
            label="Or another amount"
            optional
            hint="We recommend starting with at least $2,500 a month."
          >
            <Input
              inputMode="numeric"
              placeholder="$ per month"
              value={
                BUDGET_PRESETS.includes(a.budget) || a.budget === "recommend"
                  ? ""
                  : a.budget
              }
              onChange={(e) => set("budget", e.target.value)}
            />
          </Field>
          <BudgetPerProperty
            budget={a.budget}
            propertyCount={a.propertyUrls.length}
            all={a.allProperties}
          />
          <Check
            checked={a.billingAcknowledged}
            onChange={(v) => set("billingAcknowledged", v)}
            label="Got it. Ad spend is invoiced at the end of each month, for what actually ran."
            required
          />
          <Field
            label="Should invoices go somewhere else?"
            optional
            hint="A bookkeeper, an owner, or an accounts inbox."
          >
            <Input
              value={a.invoiceEmail}
              onChange={(e) => set("invoiceEmail", e.target.value)}
            />
          </Field>
        </>
      ),
    },
    {
      label: "Creative",
      title: "Where can we find your photos and video?",
      help: "We build the ads from your booking site: your photography, your homes, your logo. Links are easiest, so nothing has to upload.",
      complete: true,
      body: (
        <>
          <Field
            label="Photos and video"
            optional
            hint="A Google Drive or Dropbox link. Include content from the specific homes you want to feature, plus the best content you have overall. Walkthroughs, drone shots, anything you or your team filmed, plus any creator content you have the rights to use."
          >
            <Input
              type="url"
              placeholder="https://drive.google.com/..."
              value={a.creativeDriveUrl}
              onChange={(e) => set("creativeDriveUrl", e.target.value)}
            />
          </Field>
          <Field
            label="Past guest list"
            optional
            hint="Name and email is all we use: to find more people like your best guests, and to stop paying to reach people who already stayed. The same link works if it is all one folder."
          >
            <Input
              type="url"
              placeholder="https://drive.google.com/..."
              value={a.guestListDriveUrl}
              onChange={(e) => set("guestListDriveUrl", e.target.value)}
            />
          </Field>
          <p className="rounded-lg border border-border-primary px-3 py-2.5 text-xs leading-relaxed text-secondary">
            <span className="font-medium text-primary">
              Check the sharing settings first.
            </span>
            {
              " A private link opens for you but not for us. In Google Drive, click Share and set General access to “Anyone with the link”. In Dropbox, copy a link that allows viewing."
            }
          </p>
        </>
      ),
    },
    {
      label: "Connect",
      title: "Last step: give us access",
      help: prefill.links?.connect
        ? "Click the button, sign in and approve. You stay the owner of everything and can revoke our access any time."
        : "You can finish the intake now. Your Wander contact will share a private connection link.",
      complete: !prefill.links?.connect || a.accountsConnected,
      body: (
        <>
          {prefill.links?.connect ? (
            <Button variant="primary" size="md" className="w-full">
              Connect advertising accounts
            </Button>
          ) : (
            <p className="text-sm text-secondary">
              Ask your Wander contact for your private account connection link.
            </p>
          )}
          {prefill.links?.connect && (
            <p className="mt-3 text-sm text-secondary">
              The link opens Wander Growth Connect, where you approve your Meta
              Ads and Google Ads accounts.
            </p>
          )}
          {prefill.links?.emailDns ? (
            <div className="mt-6 space-y-3">
              <h3 className="font-medium">Set up your email domain</h3>
              <p className="text-sm font-medium text-secondary">
                Optional, but strongly recommended
              </p>
              <p className="text-sm text-secondary">
                Send guest marketing emails from your own domain. Open the setup
                link to connect your DNS provider through Entri or add the
                records yourself. You can finish this intake and return to email
                setup later.
              </p>
              <Button variant="secondary" size="md" className="w-full">
                Set up email and DNS
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-secondary">
              Email setup is optional, but strongly recommended for sending
              guest marketing emails from your own domain. Your Wander contact
              will share an email / DNS setup link when your sending domain is
              prepared.
            </p>
          )}
          {prefill.links?.connect && <SetupCheck setup={setup} />}
          {prefill.links?.connect && (
            <Check
              checked={a.accountsConnected}
              onChange={(v) => set("accountsConnected", v)}
              label="Done, I've approved access."
              required
            />
          )}
        </>
      ),
    },
    {
      label: "Done",
      title: "That's everything",
      help: `${prefill.repName ?? "Your Wander contact"} takes it from here. Your launch plan comes back within two business days.`,
      complete: true,
      body: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-secondary">
            That is everything we need. Send it over and we will take it from
            here.
          </p>
          <Button variant="primary" size="md" className="w-full">
            Send it in
          </Button>
        </div>
      ),
    },
  ];
}

/** What the Done step turns into once the submit succeeds. */
export function SentNotice({ repName }: { repName: string | null }) {
  return (
    <div className="space-y-2 rounded-xl border border-border-secondary p-5">
      <p className="text-sm font-medium">Sent. Nothing else needed from you.</p>
      <p className="text-sm leading-relaxed text-secondary">
        {repName ?? "Your Wander contact"} has everything and your launch plan
        comes back within two business days. If anything changes on your side, a
        property coming offline or new photography, just send it over.
      </p>
    </div>
  );
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
          <span className="text-[11px] text-secondary">Optional</span>
        )}
        {required && (
          <span className="text-[11px] text-amber-500">Required</span>
        )}
      </div>
      {hint && <p className="text-xs leading-relaxed text-secondary">{hint}</p>}
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
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5 shrink-0"
      />
      <span>
        {label}
        {required && !checked && (
          <span className="ml-1.5 text-[11px] text-amber-500">Required</span>
        )}
      </span>
    </label>
  );
}

function Chip({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-surface-primary"
          : "border-border-secondary hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}

function PropertyPicker({
  listings,
  supported,
  selected,
  all,
}: {
  listings: IntakeListing[];
  supported: boolean;
  selected: string[];
  all: boolean;
}) {
  // The live picker floats ticked homes above a search filter. With no
  // query to type, its first 60 rows are simply the list.
  const shown = listings.slice(0, 60);

  return (
    <div className="space-y-3">
      <Chip active={all}>All of them</Chip>

      {(!all || supported) && (
        <>
          {supported && listings.length > 0 && (
            <>
              {listings.length > 12 && (
                <Input
                  value=""
                  placeholder={`Search ${listings.length} homes by name or URL…`}
                  onChange={noop}
                />
              )}
              <div className="max-h-72 divide-y divide-border-primary overflow-y-auto rounded-xl border border-border-secondary">
                {shown.map((row) => (
                  <div
                    key={row.url}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={selected.includes(row.url)}
                        className="shrink-0"
                      />
                      {row.imageUrl ? (
                        // oxlint-disable-next-line nextjs/no-img-element
                        <img
                          src={row.imageUrl}
                          alt=""
                          loading="lazy"
                          className="size-10 shrink-0 rounded-md bg-surface-secondary object-cover"
                        />
                      ) : (
                        <span className="size-10 shrink-0 rounded-md bg-surface-secondary" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {row.name}
                      </span>
                    </label>
                    {row.bedrooms != null && (
                      <span className="shrink-0 text-xs text-secondary">
                        {row.bedrooms} bd
                      </span>
                    )}
                    <span className="shrink-0 px-1 text-xs text-secondary">
                      ↗
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!supported && (
            <>
              <div className="flex gap-2">
                <Input
                  type="url"
                  value=""
                  placeholder="https://yoursite.com/..."
                  onChange={noop}
                />
                <Button variant="secondary" size="md" className="shrink-0">
                  Add
                </Button>
              </div>
              {/* The live form keeps pasted URLs in state but never lists
                  them, so only the count below shows what was added. */}
            </>
          )}

          {selected.length > 0 && (
            <p className="text-xs text-secondary">
              {selected.length} home{selected.length === 1 ? "" : "s"} selected
              {selected.length > 10
                ? ". More than ten spreads the budget thin."
                : "."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BudgetPerProperty({
  budget,
  propertyCount,
  all,
}: {
  budget: string;
  propertyCount: number;
  all: boolean;
}) {
  const dollars = Number.parseFloat(budget.replace(/[^0-9.]/g, ""));
  if (all || propertyCount === 0 || !Number.isFinite(dollars) || dollars <= 0) {
    return null;
  }
  const per = Math.round(dollars / propertyCount);
  if (per >= MIN_PER_PROPERTY) {
    return null;
  }
  return (
    <p className="text-xs leading-relaxed text-amber-600">
      That is about ${per} per home per month across {propertyCount} homes.
      Under ${MIN_PER_PROPERTY} each, the spend spreads too thin to get real
      traction. Either raise the budget or feature fewer homes.
    </p>
  );
}

const STATE_LABELS = {
  ready: "Ready",
  action_required: "Action needed",
  pending: "Wander is finishing setup",
  unknown: "Not verified",
};

/** IntakeSetupCheck's rendering, fed a fixture instead of /api/intake/check. */
function SetupCheck({ setup }: { setup: IntakeSetup | null }) {
  return (
    <section
      className="mt-6 rounded-xl border border-border-primary p-4"
      aria-label="Account setup status"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Your setup status</h3>
        <Button variant="secondary" size="sm" type="button">
          Check again
        </Button>
      </div>
      <p className="mt-2 text-sm text-secondary">
        We check when you reach this step and when you return from connecting an
        account or updating DNS. You can submit while Wander finishes any
        remaining setup.
      </p>
      {setup ? (
        <>
          <p className="mt-4 text-sm font-medium">
            {setup.ready
              ? "All listed setup checks are ready."
              : "Here is what is ready and what still needs attention."}
          </p>
          <ul className="mt-3 space-y-4">
            {setup.checks.map((item) => (
              <li key={item.key}>
                <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span>{STATE_LABELS[item.state]}</span>
                </div>
                <p className="mt-1 text-sm text-secondary">{item.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-secondary">
            Last checked{" "}
            {new Date(setup.checkedAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/New_York",
            })}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-secondary">
          We could not check your setup right now. Please try again or contact
          your Wander team.
        </p>
      )}
    </section>
  );
}
