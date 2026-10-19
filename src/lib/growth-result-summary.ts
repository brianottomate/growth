export type GrowthSummaryRow = {
  title: string;
  detail?: string;
  thumbnail?: string;
  badge?: string;
  href?: string;
};
export type GrowthResultSummary = {
  title: string;
  description: string;
  facts: string[];
  rows: GrowthSummaryRow[];
  href: string;
  linkLabel: string;
  note?: string;
};

export const growthSummaryTools: Record<string, string> = {
  "contentRead.getWorkItem": "workitem",
  "adsRead.openCampaign": "campaign",
  "adsRead.ideaContext": "creative",
  "adsWrite.saveIdea": "creative",
  "adsWrite.draftAd": "creative",
  "adsRead.catalogState": "catalog",
  "brandRead.getMap": "brands",
  "brandRead.list": "brands",
  "mediaLibraryRead.listingPhotos": "photos",
  "contentRead.upcoming": "calendar",
  "contentRead.pipeline": "pipeline",
  "contentRead.productionQueue": "production",
  "adsRead.top": "performance",
  "emailRead.get": "email",
};

/** Pure, self-contained projection shared with the sandboxed external widget.
 * Keep helpers inside this function: its JavaScript is embedded in the MCP HTML.
 * No host APIs, imports, current-time lookups, or writes belong in this projection.
 */
export function growthResultSummary(
  kind: string,
  result: unknown,
): GrowthResultSummary {
  function obj(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  function list(value: unknown) {
    return Array.isArray(value) ? value.map(obj) : [];
  }
  function text(value: unknown, fallback = "") {
    return typeof value === "string" && value ? value : fallback;
  }
  function count(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  function path(value: unknown, fallback: string) {
    return typeof value === "string" && value.startsWith("/app/")
      ? value
      : fallback;
  }
  function thumbnail(value: unknown) {
    const m = obj(value);
    const url = text(
      m.thumbnail,
      text(m.thumbUrl, text(m.imageUrl, m.type === "video" ? "" : text(m.url))),
    );
    return url.startsWith("https://") ? url : undefined;
  }
  // WanderOS may wrap its public asset in a site-specific image proxy. The
  // underlying first-party asset is already covered by the connector image CSP.
  function brandLogo(value: unknown) {
    const source = text(value);
    if (!source.startsWith("https://")) return undefined;
    try {
      const url = new URL(source);
      const original = url.searchParams.get("src");
      if (url.pathname.startsWith("/i/") && original) {
        const asset = new URL(original);
        if (
          asset.protocol === "https:" &&
          ["assets-websites.wander.com", "assets.wander.com"].includes(
            asset.hostname,
          )
        )
          return asset.href;
      }
      return source;
    } catch {
      return undefined;
    }
  }
  function status(value: unknown) {
    return text(value, "Not recorded").replace(/_/g, " ");
  }
  const envelope = obj(result),
    d = obj(envelope.data),
    brand = obj(d.brand);
  const summary: GrowthResultSummary = {
    title: "Growth result",
    description: "",
    facts: [],
    rows: [],
    href: "/app/overview",
    linkLabel: "View workspace",
  };
  if (envelope.ok === false) {
    summary.title = "Could not load this result";
    summary.description = text(
      obj(envelope.error).message,
      "Try the request again.",
    );
    return summary;
  }
  if (kind === "email") {
    const document = obj(d.document),
      spot = obj(d.spot),
      content = obj(d.content);
    const series = obj(content.series);
    const latestSend = list(d.messageSends).sort((a, b) =>
      text(b.createdAt).localeCompare(text(a.createdAt)),
    )[0];
    const sent = Boolean(spot.publishedAt) || spot.status === "published";
    const queued = !sent && spot.status === "scheduled";
    const approved = sent || queued || spot.status === "approved";
    summary.title = text(
      document.subject,
      text(content.title, "Untitled email"),
    );
    summary.description = [
      text(brand.name),
      text(series.name, "Standalone broadcast"),
    ]
      .filter(Boolean)
      .join(" · ");
    summary.facts = [
      sent
        ? "Sent"
        : latestSend?.status === "failed"
          ? "Delivery needs review"
          : latestSend?.status === "sending"
            ? "Sending"
            : queued
              ? "Delivery scheduled"
              : "Delivery not scheduled",
      approved
        ? "Creative approved"
        : spot.status === "pending_review"
          ? "Ready for review"
          : "Draft creative",
    ];
    const plannedAt = text(spot.scheduledAt);
    if (plannedAt && !sent)
      summary.facts.push(
        `${queued ? "Delivery" : "Tentative"}: ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(plannedAt))} UTC`,
      );
    summary.rows = [
      {
        title: text(document.preheader, "No preheader yet"),
        detail: text(
          document.bodyMarkdown,
          "Email copy has not been drafted yet.",
        ),
        thumbnail: thumbnail(list(spot.media)[0]),
      },
    ];
    if (text(document.ctaLabel))
      summary.rows.push({
        title: text(document.ctaLabel),
        detail: text(document.ctaUrl, "CTA destination not set"),
      });
    summary.href = path(d.url, "/app/newsletters");
    summary.linkLabel = "Open email in Growth";
    summary.note =
      latestSend?.status === "failed"
        ? "The latest delivery attempt failed. Review its status in Growth before trying again."
        : sent
          ? "Open Growth for the full creative and delivery report."
          : "Calendar planning, creative approval and delivery are separate. Review the full email in Growth.";
  } else if (kind === "workitem") {
    const ready = obj(d.readiness);
    summary.title = text(d.title, "Untitled content");
    summary.description = [text(brand.name), status(d.status)]
      .filter(Boolean)
      .join(" · ");
    summary.facts = [
      `${count(ready.completed)}/${count(ready.total)} checks complete`,
      `${list(d.platformPosts).length} platform drafts`,
    ];
    summary.rows = [
      {
        title: text(obj(d.brief).hook, "Brief not filled in"),
        detail: text(
          obj(ready.next).detail,
          ready.readyForReview
            ? "Ready for review"
            : "Review outstanding checks",
        ),
        thumbnail: thumbnail(list(d.media)[0]),
      },
    ];
    summary.href = path(d.url, "/app/content");
    summary.linkLabel = "View content";
  } else if (kind === "campaign") {
    const campaign = obj(d.campaign),
      handoff = obj(d.handoff);
    summary.title = text(campaign.name, "Campaign");
    summary.description = [text(brand.name), status(campaign.status)]
      .filter(Boolean)
      .join(" · ");
    summary.facts = [
      `${list(d.ads).length} creative drafts`,
      `${list(d.audiences).length} audiences`,
      `${list(d.platformCampaigns).length} platform campaigns`,
    ];
    summary.description += text(handoff.nextAction)
      ? ` · ${text(handoff.nextAction)}`
      : "";
    summary.href = path(
      handoff.reviewPath,
      text(campaign.id)
        ? `/app/campaigns/${encodeURIComponent(text(campaign.id))}`
        : "/app/campaigns",
    );
    summary.linkLabel = "View campaign";
  } else if (kind === "creative") {
    const ad = d.ad ? obj(d.ad) : d,
      content = obj(ad.content),
      doc = obj(ad.document || obj(content.ideaStudio).document),
      copy = obj(doc.copy || content);
    summary.title = text(ad.name, "Creative draft");
    summary.description = text(
      copy.headline,
      text(copy.body, "Creative saved for review."),
    );
    const lead = obj(list(content.media)[0]);
    const video = content.format === "video" || lead.type === "video";
    summary.facts = [
      // `drawn` is the stored name of the draft state the studio calls Draft.
      ad.approved
        ? "Approved"
        : status(ad.status === "drawn" ? "draft" : ad.status || "draft"),
      video
        ? lead.story
          ? "Video · Feed + Stories/Reels"
          : "Video"
        : `${list(doc.cards).length} slides`,
    ];
    const source =
      obj(list(doc.cards)[0]).source ||
      obj(list(d.images)[0]).source ||
      list(content.media)[0];
    if (thumbnail(source))
      summary.rows = [
        {
          title: text(d.campaignName, "Creative preview"),
          thumbnail: thumbnail(source),
        },
      ];
    const campaignId = text(d.campaignId, text(ad.campaignId));
    summary.href = campaignId
      ? `/app/campaigns/${encodeURIComponent(campaignId)}`
      : "/app/campaigns";
    summary.linkLabel = "View creative";
  } else if (kind === "catalog") {
    const cards = list(obj(d.draft).cards),
      included = cards.filter((c) => c.included);
    summary.title = "Catalog batch";
    summary.description = `${cards.length} returned cards`;
    summary.facts = [
      `${included.length} included`,
      `${included.filter((c) => c.approved).length} approved`,
      `${Array.isArray(d.unwritten) ? d.unwritten.length : 0} unwritten`,
    ];
    summary.rows = included.slice(0, 2).map((c) => ({
      title: text(c.title, "Catalog card"),
      detail: c.approved ? "Approved" : "Needs approval",
      thumbnail: thumbnail(c),
    }));
    summary.href = path(d.reviewPath, "/app/performance/brands");
    summary.linkLabel = text(d.reviewPath) ? "View catalog" : "View brands";
    summary.note = text(d.enrichmentError) || undefined;
  } else if (kind === "brands") {
    const brands = list(d.brands);
    summary.title = "Brands";
    summary.description = `${brands.length} ${brands.length === 1 ? "brand" : "brands"} found`;
    summary.rows = brands.slice(0, 3).map((b) => ({
      title: text(b.name, "Brand"),
      detail: text(
        b.tagline,
        b.surfaces
          ? `${count(obj(b.surfaces).pendingReviews)} pending reviews`
          : text(b.relationship),
      ),
      href: path(
        b.url,
        `/app/brands/${encodeURIComponent(text(b.slug, text(b.id)))}`,
      ),
      badge: text(b.relationship) || undefined,
      thumbnail: brandLogo(b.logo),
    }));
    summary.href = "/app/brands";
    summary.linkLabel = "View all brands";
    if (!brands.length) summary.description = "No brands returned.";
    if (brands.length > 3)
      summary.note = `Showing 3 of ${brands.length} returned brands.`;
  } else if (kind === "photos") {
    const homes = list(d.homes);
    summary.title = "Listing photos";
    summary.description =
      d.hasSite === false
        ? "No property site connected."
        : `${homes.length} returned homes of ${count(d.total)} matching homes`;
    summary.rows = homes.slice(0, 3).map((h) => ({
      title: text(h.name, "Home"),
      detail: text(h.place),
      thumbnail: thumbnail(h),
    }));
    summary.href = "/app/media";
    summary.linkLabel = "View media";
    if (homes.length > 3)
      summary.note = `Showing 3 of ${homes.length} returned homes. Browse and select imagery in Growth.`;
  } else if (kind === "calendar") {
    const posts = list(d.posts).concat(list(d.standalonePlatformPosts));
    summary.title = "Content calendar";
    summary.description = `${posts.length} items · ${text(obj(d.window).from).slice(0, 10)} – ${text(obj(d.window).through).slice(0, 10)}`;
    summary.facts = [
      `${posts.filter((p) => p.status === "scheduled").length} scheduled`,
      `${posts.filter((p) => p.status === "pending_review").length} need review`,
    ];
    summary.href = "/app/calendar";
    summary.linkLabel = "View calendar";
  } else if (kind === "pipeline") {
    const statuses = list(d.byStatus);
    summary.title = "Content pipeline";
    summary.description = `${count(d.total)} content work items · ${count(d.standaloneTotal)} standalone posts`;
    summary.facts = statuses
      .filter((s) =>
        ["pending_review", "scheduled", "draft"].includes(text(s.status)),
      )
      .map((s) => `${count(s.count)} ${status(s.status)}`);
    summary.href = "/app/content";
    summary.linkLabel = "View pipeline";
  } else if (kind === "production") {
    const items = list(d.items);
    summary.title = "Production queue";
    summary.description = text(brand.name);
    summary.facts = [
      `${items.length} returned items`,
      `${items.filter((i) => i.readyForReview).length} ready for review`,
    ];
    summary.rows = items.slice(0, 3).map((i) => ({
      title: text(i.title, "Untitled content"),
      detail: i.readyForReview
        ? "Ready for review"
        : text(
            obj(i.next).label,
            `${count(i.completed)}/${count(i.total)} checks complete`,
          ),
      href: path(i.url, "/app/content"),
    }));
    summary.href = "/app/content";
    summary.linkLabel = "View production";
    if (items.length > 3)
      summary.note = `Showing 3 of ${items.length} returned items.`;
  } else if (kind === "performance") {
    const ads = list(d.ads),
      metric = text(obj(d.filters).metric, "clicks");
    summary.title = "Ad performance";
    summary.description = `${text(brand.name)} · ${ads.length} shown of ${count(d.matched)} matching ads`;
    summary.rows = ads.slice(0, 3).map((ad) => ({
      title: text(ad.name, "Untitled ad"),
      detail: `${count(ad[metric])} ${metric} · ${status(ad.status)}`,
      thumbnail: thumbnail({ url: ad.thumbnailUrl }),
    }));
    summary.href = text(brand.slug)
      ? `/app/brands/${encodeURIComponent(text(brand.slug))}/performance`
      : "/app/performance";
    summary.linkLabel = "View performance";
    summary.note = `${text(obj(d.window).fromDate)} – ${text(obj(d.window).toDate)} · Metrics apply to the returned shortlist.`;
  }
  return summary;
}
