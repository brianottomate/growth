import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  channelTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const KINDS = [
  { value: "social", label: "Social" },
  { value: "ad", label: "Ads" },
  { value: "newsletter", label: "Newsletters" },
  { value: "blog", label: "Blog" },
];

type Channel = typeof channelTable.$inferSelect;

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
    </div>
  );
}

// Read-only chip — mirrors the Brands page look (logo + label + handle).
function ChannelChip({ channel }: { channel: Channel }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
      <ChannelLogo platform={channel.platform} />
      <span className="flex flex-col leading-tight">
        <span className="text-xs font-medium">{platformLabel(channel.platform)}</span>
        {channel.handle && (
          <span className="text-muted-foreground text-[11px]">{channel.handle}</span>
        )}
      </span>
    </div>
  );
}

function ChannelGroup({ label, channels }: { label: string; channels: Channel[] }) {
  if (channels.length === 0) return null;
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wide">
        {label} · {channels.length}
      </div>
      <div className="flex flex-wrap gap-2">
        {channels.map((c) => (
          <ChannelChip key={c.id} channel={c} />
        ))}
      </div>
    </div>
  );
}

export default async function OverviewPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return (
      <div className="text-muted-foreground p-8">
        No organization found for your account.
      </div>
    );
  }

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
    // Earliest-created first for a deterministic order; may switch to an explicit order column later.
    orderBy: (b, { asc }) => asc(b.createdAt),
  });
  const brandIds = brands.map((b) => b.id);

  const channels = brandIds.length
    ? await db.query.channelTable.findMany({
        where: inArray(channelTable.brandId, brandIds),
      })
    : [];

  const inspirations = brandIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, brandIds),
        with: { inspirationBrand: true },
      })
    : [];

  const postCount = brandIds.length
    ? await db.$count(platformPostTable, inArray(platformPostTable.brandId, brandIds))
    : 0;

  // Rolled-up follower count across owned brands' social channels (latest capture per channel).
  const followerChannels = channels.filter(
    (c) => c.kind === "social" && c.followerCount != null,
  );
  const totalFollowers = followerChannels.reduce(
    (sum, c) => sum + (c.followerCount ?? 0),
    0,
  );
  const followerFmt = new Intl.NumberFormat("en-US");

  // Dedupe tracked brands by the referenced brand id.
  const trackedMap = new Map<string, { name: string; purpose: string }>();
  for (const insp of inspirations) {
    if (insp.inspirationBrand) {
      trackedMap.set(insp.inspirationBrand.id, {
        name: insp.inspirationBrand.name,
        purpose: insp.purpose,
      });
    }
  }
  const tracked = [...trackedMap.values()];

  const user = session.user;
  const firstName = user.name?.split(" ")[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarImage src={user.image ?? undefined} alt={user.name ?? "You"} />
          <AvatarFallback className="text-lg font-semibold">
            {(user.name ?? user.email ?? "U").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome{firstName ? `, ${firstName}` : ""}!
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{user.email}</p>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">{org.name}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Organization · {org.plan} plan · {brands.length} brands · {channels.length} channels ·{" "}
        {tracked.length} tracked
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Brands"
          value={`${brands.length}`}
          hint={`${brands.filter((b) => b.type === "company").length} company · ${brands.filter((b) => b.type === "personal").length} personal`}
        />
        <StatCard label="Channels" value={`${channels.length}`} />
        <StatCard
          label="Followers"
          value={followerFmt.format(totalFollowers)}
          hint={
            followerChannels.length
              ? `across ${followerChannels.length} social channels`
              : "no captures yet"
          }
        />
        <StatCard label="Tracked brands" value={`${tracked.length}`} hint="competitors + inspiration" />
        <StatCard label="Platform posts" value={`${postCount}`} hint="across all brands" />
      </div>

      <h2 className="text-muted-foreground mt-10 mb-3 text-xs font-semibold uppercase tracking-wider">
        Your brands
      </h2>
      <div className="flex flex-col gap-4">
        {brands.map((brand) => {
          const brandChannels = channels.filter((c) => c.brandId === brand.id);
          return (
            <div key={brand.id} className="bg-card rounded-2xl border p-5 shadow-sm">
              <div className="flex items-start gap-3.5">
                {brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logo}
                    alt=""
                    className="size-11 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold">
                    {brand.name.slice(0, 2)}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-semibold">{brand.name}</span>
                    <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium">
                      {brand.type}
                    </span>
                    {brand.website && (
                      <a
                        href={brand.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        {brand.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                  {brand.tagline && (
                    <p className="text-muted-foreground mt-1 text-sm">{brand.tagline}</p>
                  )}
                </div>
              </div>

              {brandChannels.length > 0 && (
                <div className="mt-3 flex flex-col gap-3">
                  {KINDS.map(({ value, label }) => (
                    <ChannelGroup
                      key={value}
                      label={label}
                      channels={brandChannels.filter((c) => c.kind === value)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tracked.length > 0 && (
        <>
          <h2 className="text-muted-foreground mt-10 mb-3 text-xs font-semibold uppercase tracking-wider">
            Tracked brands
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {tracked.map((t) => (
              <div
                key={t.name}
                className="bg-card flex items-center justify-between rounded-xl border p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="bg-muted flex size-7 items-center justify-center rounded-md text-xs font-semibold">
                    {t.name.slice(0, 2)}
                  </div>
                  <span className="text-sm font-medium">{t.name}</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    t.purpose === "competitor"
                      ? "bg-amber-500/10 text-amber-500"
                      : "bg-sky-500/10 text-sky-400"
                  }`}
                >
                  {t.purpose}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
