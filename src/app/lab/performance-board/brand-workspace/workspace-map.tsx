import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </article>
  );
}

function Column({
  title,
  purpose,
  children,
}: {
  title: string;
  purpose: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="w-[360px] shrink-0 space-y-3 rounded-2xl border bg-background/70 p-4"
    >
      <header className="min-h-24 border-b pb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {purpose}
        </p>
      </header>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">{children}</p>
    </div>
  );
}

export function WorkspaceMap() {
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b px-6 py-5">
        <Link
          href="/lab/performance-board"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Performance
          vision board
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            One brand, side by side
          </h1>
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            Display-only fixture
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          The current client-tab split, illustrated with example data. All
          columns are visible together; scroll sideways to compare. Summit Stays
          and every fact below are illustrative.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-6">
        <div className="mb-5 flex w-max items-center gap-4 rounded-xl border bg-background px-4 py-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
            SS
          </div>
          <div>
            <p className="text-sm font-semibold">Summit Stays</p>
            <p className="text-xs text-muted-foreground">
              Mountain homes · example client
            </p>
          </div>
          <span className="ml-4 rounded-full border px-2 py-1 text-xs">
            Onboarding
          </span>
        </div>
        <div className="flex w-max items-start gap-4">
          <Column
            title="Overview"
            purpose="Account summary, observed readiness, submission, contacts and media."
          >
            <Block title="At a glance">
              <div className="grid grid-cols-2 gap-3">
                <Fact label="Journey">Onboarding</Fact>
                <Fact label="Management">$3,000 / month</Fact>
                <Fact label="Catalog">Creating</Fact>
                <Fact label="Meta">Not recorded</Fact>
              </div>
            </Block>
            <Block title="Launch checklist">
              <Fact label="Observed progress">
                Onboarding · Creative · Launch
              </Fact>
              <Fact label="Suggested next action">
                Review the submitted intake
              </Fact>
              <p>
                Progress follows app records. It does not move the client’s
                manual journey stage.
              </p>
            </Block>
            <Block title="Client intake">
              <Fact label="Submission">Submitted · October 1, 2026 · Alex</Fact>
              <Fact label="Review">Awaiting team review · not applied</Fact>
              <div className="space-y-3 border-t pt-3">
                <Fact label="Homes to promote">
                  Pine Ridge Lodge · Creekside Cabin · The Lookout
                </Fact>
                <Fact label="Client priorities">
                  More autumn weekday bookings; highlight space for families and
                  easy access to trails.
                </Fact>
                <Fact label="Monthly ad budget">$2,000</Fact>
                <Fact label="Creative guidance">
                  Lead with the homes and surroundings. Keep copy warm and avoid
                  discount-led messaging.
                </Fact>
              </div>
              <p className="text-xs">
                Illustrative client answers, kept separate from the team’s brand
                story and personas. Review before applying them to shared brand
                settings; applying does not rebuild existing creative.
              </p>
            </Block>
            <Block title="Client context">
              <Fact label="Client contact">Alex · example contact</Fact>
              <Fact label="CRM contacts">
                Linked HubSpot company and contacts
              </Fact>
            </Block>
            <Block title="Media library">
              <Fact label="Assets">Photos and saved creative previews</Fact>
              <p>Open Studio or the library to continue production.</p>
            </Block>
          </Column>
          <Column
            title="Setup"
            purpose="Prepare and refine the shared foundations used by creative and campaigns."
          >
            <Block title="Identity">
              <Fact label="Logo & brand mark">
                Prepared · review light and dark variants
              </Fact>
              <Fact label="Typography">
                Serif headings · clean sans-serif body
              </Fact>
              <Fact label="Visual check">
                General brand image selected for checking the mark and fonts; no
                representative home or property facts implied
              </Fact>
            </Block>
            <Block title="Story & positioning">
              <p>
                Room to reconnect, with thoughtful homes and local outdoor
                experiences.
              </p>
              <Fact label="Preparation">Draft ready for team review</Fact>
              <p className="text-xs">
                Refine the story here; creative workflows use the shared
                context.
              </p>
            </Block>
            <Block title="Personas & seed lists">
              <Fact label="Guest motivations">
                Togetherness · Easy outdoor access · Space and privacy
              </Fact>
              <Fact label="Preparation">
                Personas drafted; review evidence and assumptions
              </Fact>
              <p className="text-xs">
                Brand-level context. Campaign targeting is chosen separately.
              </p>
            </Block>
            <p className="px-1 text-xs leading-5 text-muted-foreground">
              Identity, story and personas inform creative. Only the inputs
              needed for a particular task should block that task. Destinations
              live in WanderOS.
            </p>
          </Column>
          <Column
            title="WanderOS"
            purpose="Featured homes, groups, destinations, booking targets and inventory."
          >
            <Block title="Home inventory">
              <Fact label="Source">WanderOS · 12 example homes</Fact>
              <div className="divide-y rounded-lg border">
                <p className="p-3">Pine Ridge Lodge · Blue Ridge</p>
                <p className="p-3">Creekside Cabin · Blue Ridge</p>
                <p className="p-3">The Lookout · Smoky Mountains</p>
              </div>
            </Block>
            <Block title="Reusable home groups">
              <Fact label="Featured">
                6 homes selected for starting creative
              </Fact>
              <Fact label="Family escapes">
                4 homes · space for larger groups
              </Fact>
            </Block>
            <Block title="Destinations">
              <Fact label="Destinations">Blue Ridge · Smoky Mountains</Fact>
              <p>Group home locations for creative and campaign planning.</p>
            </Block>
            <Block title="Booking targets">
              <Fact label="Autumn mountain stays">
                Featured homes · selected stay dates
              </Fact>
              <p>
                Reusable booking destination. A campaign chooses whether to use
                it.
              </p>
              <p className="text-xs">
                The booking site handles availability; this is not an
                availability report.
              </p>
            </Block>
          </Column>
          <Column
            title="Catalog"
            purpose="Prepare, review, and export the home cards as their own workflow."
          >
            <Block title="Home cards">
              <Fact label="Homes">Featured group · 6 cards</Fact>
              <Fact label="Status">Creating</Fact>
              <Fact label="Review">Check copy, crops, and included homes</Fact>
            </Block>
            <Block title="Catalog handoff">
              <Fact label="Sequence">
                Creating → Approved → Export ready → Live
              </Fact>
              <p className="text-xs">
                Catalog readiness is independent of ad creative and platform
                delivery. A catalog can return to Creating while Meta stays
                Live.
              </p>
            </Block>
          </Column>
          <Column
            title="Campaigns"
            purpose="Choose the goal, creative, destination, and targeting; manage launch and delivery."
          >
            <Block title="Autumn family escapes">
              <Fact label="Goal">Promote autumn mountain stays</Fact>
              <Fact label="Creative">Select approved Ad studio creative</Fact>
              <Fact label="Destination">
                Autumn mountain stays booking target
              </Fact>
            </Block>
            <Block title="Audience planning">
              <Fact label="Persona context">Families reconnecting</Fact>
              <Fact label="Targeting">
                Review guest-origin geography and Meta audience choices
              </Fact>
              <p className="text-xs">
                A persona provides context; it does not automatically become
                platform targeting.
              </p>
            </Block>
            <Block title="Platform & delivery">
              <Fact label="Meta">Draft</Fact>
              <Fact label="Google">Not created</Fact>
              <Fact label="Launch">
                Creative approval, provider push, and going Live are separate
                steps
              </Fact>
            </Block>
            <Block title="Creative adjustments">
              <p>
                Use the same Studio tools for campaign-specific edits. Keep
                reusable production and delivery decisions distinct.
              </p>
            </Block>
          </Column>
          <Column
            title="Email"
            purpose="Sender setup, newsletter production and email audiences."
          >
            <Block title="Sender & DNS">
              <Fact label="Readiness">Not recorded</Fact>
              <p>Connect the sender and verify its marketing domain.</p>
            </Block>
            <Block title="Newsletters & audiences">
              <p>
                Plan and preview newsletters; prepare warehouse-backed audience
                snapshots for email work.
              </p>
            </Block>
          </Column>
          <Column
            title="Settings"
            purpose="Connection controls, home sync, access and commercial inputs."
          >
            <Block title="WanderOS connection & sync">
              <Fact label="Connection">Connected · example site</Fact>
              <p>Configure the booking site and refresh the home feed here.</p>
            </Block>
            <Block title="Access & commercial settings">
              <p>
                Account connection links, ad-account access, recorded terms and
                applied intake values.
              </p>
            </Block>
          </Column>
          <Column
            title="Ad studio"
            purpose="Turn shared brand context into creative, before deciding how it runs."
          >
            <Block title="Creative brief">
              <Fact label="Brand idea">Room to reconnect</Fact>
              <Fact label="Guest">Families reconnecting</Fact>
              <Fact label="Homes">Family escapes group</Fact>
              <p className="text-xs">
                Story, destinations, personas, and identity inform the work
                here.
              </p>
            </Block>
            <Block title="Ad creative">
              <Fact label="Concept">
                Trade the group chat for a weekend together.
              </Fact>
              <Fact label="Production">
                Copy · photos · composition · size variants
              </Fact>
              <Fact label="Status">In review</Fact>
            </Block>
            <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
              Approved creative{" "}
              <ArrowRight className="size-3.5" aria-hidden="true" /> campaign
              selection
            </div>
          </Column>
          <Column title="Pitch" purpose="Prepare the client-facing sales page.">
            <Block title="Pitch editor">
              <p>
                Refine the pitch, choose media and inspect the visual preview.
              </p>
            </Block>
          </Column>
          <Column
            title="Extra"
            purpose="Additional tools awaiting a permanent home."
          >
            <Block title="Client page activity">
              <Fact label="Example activity">Pitch viewed</Fact>
              <p>
                Activity is currently here, separate from brand preparation in
                Setup.
              </p>
            </Block>
          </Column>
        </div>
      </div>
    </main>
  );
}
