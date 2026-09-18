import { AdMock } from "@/components/ad-mock";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { adPlatformSpec } from "@/lib/ad-platforms";
import { cardsForSurface, type WallAd } from "@/lib/ad-wall";
import type { PlatformCampaign } from "@/server/db/schema";

import { money } from "./format";

/**
 * The projected view: one block per planned platform, showing the campaign's
 * ideas rendered in that platform's shape. It reads the plan — the ideas plus
 * each platform draft's settings — and never touches a platform. It is where
 * "text vs creative" becomes visible: a text-only idea renders as a search
 * result on Google/OpenAI and is flagged as not eligible on a feed platform;
 * a creative idea renders as a feed card and its copy alone on a search one.
 */
function serpHost(url: string | null) {
  return (url ?? "wander.com").replace(/^https?:\/\//, "").split("/")[0];
}

function SerpCard({
  ad,
  landingUrl,
}: {
  ad: WallAd;
  landingUrl: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Ad · {serpHost(ad.linkUrl ?? landingUrl)}
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug font-medium text-sky-300">
        {ad.headline || "Headline"}
      </p>
      <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
        {ad.body || "Description"}
      </p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-4 text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

export function Projected({
  brandName,
  brandLogo,
  landingUrl,
  planned,
  ads,
}: {
  brandName: string;
  brandLogo: string | null;
  landingUrl: string | null;
  planned: PlatformCampaign[];
  ads: WallAd[];
}) {
  return (
    <div className="space-y-6">
      {planned.map((pc) => {
        const spec = adPlatformSpec(pc.platform);
        const label = spec?.label ?? platformLabel(pc.platform);
        const isGoogleDisplay =
          pc.platform === "google_ads" &&
          pc.settings?.google?.campaignType === "display";
        // Google Search and OpenAI are text; everything else (and Google
        // Display) renders a feed creative.
        const textMode =
          (pc.platform === "google_ads" && !isGoogleDisplay) ||
          pc.platform === "openai_ads";
        const keywords = pc.settings?.google?.keywords ?? [];
        const budget =
          pc.budget != null
            ? ` · ${money(pc.budget)}${pc.budgetType === "daily" ? "/day" : ""}`
            : "";
        return (
          <div key={pc.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ChannelLogo platform={pc.platform} className="size-4" />
              <p className="text-[13px] font-semibold">{label}</p>
              <span className="text-[11px] text-muted-foreground">
                {textMode ? "search / text" : "feed creative"}
                {budget}
              </span>
            </div>

            {textMode ? (
              <>
                <div className="grid gap-3 @2xl:grid-cols-2">
                  {ads.map((ad) => (
                    <SerpCard key={ad.id} ad={ad} landingUrl={landingUrl} />
                  ))}
                </div>
                {pc.platform === "google_ads" ? (
                  <p className="text-[11px] text-muted-foreground">
                    {keywords.length > 0
                      ? `${keywords.length} keyword${keywords.length === 1 ? "" : "s"}: ${keywords.slice(0, 6).join(", ")}${keywords.length > 6 ? "…" : ""}`
                      : "No keywords yet — a Search campaign needs them."}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="grid gap-3 @3xl:grid-cols-2">
                {ads.map((ad) => {
                  if (ad.textOnly) {
                    return (
                      <Note key={ad.id}>
                        “{ad.headline || ad.name}” is text-only — runs on Google
                        Search / OpenAI, not {label}.
                      </Note>
                    );
                  }
                  if (ad.cards.length === 0) {
                    return (
                      <Note key={ad.id}>
                        “{ad.headline || ad.name}” — awaiting a creative before
                        it can run on {label}.
                      </Note>
                    );
                  }
                  return (
                    <div key={ad.id} className="flex justify-center">
                      <AdMock
                        surface="instagram"
                        brandName={brandName}
                        brandLogo={brandLogo}
                        headline={ad.headline}
                        body={ad.body}
                        link={ad.linkUrl ?? landingUrl}
                        callToAction={ad.callToAction}
                        media={cardsForSurface(ad.cards, "instagram")}
                        className="w-full max-w-72"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
