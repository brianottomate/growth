"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteAlert } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { safeHomeUrl } from "@/lib/ad-preview-links";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { textAdCopySchema, textAdReady } from "@/lib/ad-authoring";
import type { AdReview } from "@/lib/ad-review";
import type { AdContent, MediaItem } from "@/server/db/schema";
import { orpc } from "@/orpc/client";

export type PreparedAd = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  content: AdContent;
  bookingTargetId?: string | null;
  review: AdReview;
};
const ctas = [
  ["BOOK_NOW", "Book now"],
  ["LEARN_MORE", "Learn more"],
  ["CONTACT_US", "Contact us"],
  ["SHOP_NOW", "Shop now"],
  ["SIGN_UP", "Sign up"],
] as const;
function aspect(file?: { width?: number; height?: number }) {
  if (!file?.width || !file.height) return "Aspect ratio unavailable";
  return (
    [
      [1, "Square · 1:1"],
      [9 / 16, "Story · 9:16"],
      [4 / 5, "Portrait · 4:5"],
      [16 / 9, "Landscape · 16:9"],
    ].find(
      ([ratio]) => Math.abs(file.width! / file.height! - Number(ratio)) < 0.02,
    )?.[1] ?? `${file.width} × ${file.height}`
  );
}

/** Video and text share review, copy and destination sections with independent saves. */
export function PreparedAdCard({
  ad,
  brandId,
  brandName = "",
  campaignId,
  metadata,
  website,
  deliveryState,
}: {
  ad: PreparedAd;
  brandId: string;
  brandName?: string;
  campaignId?: string;
  metadata?: ReactNode;
  website: string | null;
  deliveryState?: string;
}) {
  const router = useRouter();
  const video = "media" in ad.content ? ad.content : null;
  const text = "headlines" in ad.content ? ad.content : null;
  const [expanded, setExpanded] = useState(false);
  const [editor, setEditor] = useState<"copy" | "destination" | "video" | null>(
    null,
  );
  const [draft, setDraft] = useState(ad.content);
  const [editVersion, setEditVersion] = useState(ad.updatedAt);
  const [targetId, setTargetId] = useState(ad.bookingTargetId ?? null);
  const [picking, setPicking] = useState<"base" | "story" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const approved = ad.status === "approved";
  const ready = ad.status === "ready";
  const locked = approved || Boolean(deliveryState);
  const { data: members = [] } = useQuery(
    orpc.content.assignableMembers.queryOptions(),
  );
  const member = (id: string | null | undefined) =>
    (id && members.find((m) => m.id === id)) || null;
  const targets = useQuery({
    ...orpc.homeGroups.targets.queryOptions({ input: { brandId } }),
    enabled: editor === "destination" || Boolean(ad.bookingTargetId),
  });
  const onError = (error: { message: string }) => toast.error(error.message);
  const save = useMutation(
    orpc.ads.saveSection.mutationOptions({
      onError,
      onSuccess: () => {
        setEditor(null);
        toast.success("Changes saved");
        router.refresh();
      },
    }),
  );
  const editApproved = useMutation(
    orpc.ads.editApprovedAd.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.created
            ? "Draft made. It replaces this ad once approved."
            : "A replacement draft is already open.",
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const status = useMutation(
    orpc.ads.setAdStatus.mutationOptions({
      onError,
      onSuccess: (_result, { status: next }) => {
        toast.success(
          next === "approved"
            ? "Ad approved"
            : next === "ready"
              ? "Marked ready for review"
              : "Back to draft",
        );
        router.refresh();
      },
    }),
  );
  const remove = useMutation(
    orpc.ads.deleteAd.mutationOptions({
      onError,
      onSuccess: () => router.refresh(),
    }),
  );
  const busy = save.isPending || status.isPending || remove.isPending;
  const draftVideo = "media" in draft ? draft : null;
  const draftText = "headlines" in draft ? draft : null;
  const shownVideo = editor === "video" ? draftVideo : video;
  const base = shownVideo?.media[0];
  const target = targets.data?.targets.find(
    (t) => t.id === (editor === "destination" ? targetId : ad.bookingTargetId),
  );
  const open = (section: NonNullable<typeof editor>) => {
    setEditVersion(ad.updatedAt);
    setDraft(structuredClone(ad.content));
    setTargetId(ad.bookingTargetId ?? null);
    setEditor(section);
  };
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(ad.content) ||
    targetId !== (ad.bookingTargetId ?? null);
  const validCopy = draftText
    ? textAdCopySchema.omit({ linkUrl: true }).safeParse({
        headlines: draftText.headlines.map((s) => s.trim()).filter(Boolean),
        descriptions: draftText.descriptions
          .map((s) => s.trim())
          .filter(Boolean),
      }).success
    : true;
  const validDestination =
    !draft.linkUrl || Boolean(safeHomeUrl(draft.linkUrl));
  const apply = () => {
    const section =
      editor === "destination"
        ? {
            kind: "destination" as const,
            linkUrl: draft.linkUrl ?? "",
            bookingTargetId: targetId,
            callToAction: draftVideo?.callToAction,
          }
        : editor === "video"
          ? {
              kind: "video" as const,
              baseAssetId: draftVideo?.media[0]
                ? draftVideo.media[0].assetId
                : null,
              storyAssetId: draftVideo?.media[0]?.story
                ? draftVideo.media[0].story.assetId
                : null,
            }
          : draftText
            ? {
                kind: "text" as const,
                copy: {
                  headlines: draftText.headlines
                    .map((s) => s.trim())
                    .filter(Boolean),
                  descriptions: draftText.descriptions
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              }
            : {
                kind: "copy" as const,
                headline: draftVideo?.headline ?? "",
                body: draftVideo?.body ?? "",
                description: draftVideo?.description ?? "",
              };
    save.mutate({ adId: ad.id, expectedUpdatedAt: editVersion, section });
  };
  const actions = (
    <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
      <Button variant="ghost" disabled={busy} onClick={() => setEditor(null)}>
        Cancel
      </Button>
      <Button
        disabled={
          busy ||
          !dirty ||
          (editor === "copy" && !validCopy) ||
          (editor === "destination" && !validDestination)
        }
        loading={save.isPending}
        onClick={apply}
      >
        Apply changes
      </Button>
    </div>
  );
  const editButton = (section: NonNullable<typeof editor>, label: string) =>
    !locked && (
      <Button
        variant="outline"
        size="sm"
        disabled={busy || editor !== null}
        onClick={() => open(section)}
      >
        {label}
      </Button>
    );
  const textFields = (
    kind: "headlines" | "descriptions",
    limit: number,
    chars: number,
  ) =>
    draftText && (
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">
          {kind === "headlines" ? "Headlines" : "Descriptions"} ·{" "}
          {draftText[kind].length}/{limit}
        </legend>
        {draftText[kind].map((value, index) => (
          <div key={index} className="flex min-w-0 items-center gap-2">
            <Input
              aria-label={`${kind === "headlines" ? "Headline" : "Description"} ${index + 1}`}
              value={value}
              aria-invalid={value.length > chars}
              onChange={(e) =>
                setDraft({
                  ...draftText,
                  [kind]: draftText[kind].map((s, i) =>
                    i === index ? e.target.value : s,
                  ),
                })
              }
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {value.length}/{chars}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${kind === "headlines" ? "headline" : "description"} ${index + 1}`}
              disabled={draftText[kind].length === 1}
              onClick={() =>
                setDraft({
                  ...draftText,
                  [kind]: draftText[kind].filter((_, i) => i !== index),
                })
              }
            >
              ×
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={draftText[kind].length >= limit}
          onClick={() =>
            setDraft({ ...draftText, [kind]: [...draftText[kind], ""] })
          }
        >
          Add {kind === "headlines" ? "headline" : "description"}
        </Button>
      </fieldset>
    );
  const videoPreview = (file: MediaItem | undefined, label: string) =>
    file ? (
      <video
        key={file.url}
        src={file.url}
        poster={file.thumbnail}
        controls
        playsInline
        preload="metadata"
        aria-label={label}
        className="max-h-96 w-full rounded-lg bg-black object-contain"
      />
    ) : (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {label === "Base video"
          ? "Start with a video"
          : "No separate Story cut"}
      </div>
    );
  const preview = text ? (
    <div
      aria-label="Illustrative search preview"
      className="space-y-2 rounded-lg bg-muted/30 p-4"
    >
      <p className="text-xs text-muted-foreground">
        Search preview · illustrative combination
      </p>
      <p className="text-xs break-all">{text.linkUrl ?? website}</p>
      <p className="text-lg font-medium text-primary">
        {text.headlines.slice(0, 3).join(" | ")}
      </p>
      <p className="text-sm">{text.descriptions.slice(0, 2).join(" ")}</p>
    </div>
  ) : (
    videoPreview(video?.media[0], "Base video")
  );
  return (
    <article
      aria-label={ad.name}
      className="@container/prepared-ad space-y-5 rounded-xl border bg-card p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-semibold">{ad.name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {text ? "Text" : "Video"} ·{" "}
            {approved
              ? `Approved${member(ad.review.approvedBy)?.name ? ` · ${member(ad.review.approvedBy)?.name}` : ""}`
              : ready
                ? `Ready for review${member(ad.review.readyBy)?.name ? ` · ${member(ad.review.readyBy)?.name}` : ""}`
                : "Draft"}
            {deliveryState ? ` · ${deliveryState}` : ""}
            {ad.review.replacesAdId && !approved
              ? " · replaces an approved ad"
              : ""}
            {metadata && <> · {metadata}</>}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() =>
            sendAssistantIntent({
              type: "work_ad_campaign",
              newThread: true,
              brandId,
              brandName,
              campaignId,
              campaignName: ad.name,
              adId: ad.id,
              focus: "ads",
              visibleText: `Help me shape “${ad.name}”. Read this ad and discuss what I want to refine before making changes.`,
            })
          }
        >
          <MessageSquare className="size-3.5" />
          Shape
        </Button>
      </header>
      {!expanded ? (
        preview
      ) : (
        <>
          <section className="space-y-4 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Ad copy</h4>
              {editButton("copy", "Edit copy")}
            </div>
            {editor === "copy" ? (
              <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                {draftText ? (
                  <>
                    {textFields("headlines", 15, 30)}
                    {textFields("descriptions", 4, 90)}
                  </>
                ) : (
                  draftVideo && (
                    <>
                      {(["headline", "description", "body"] as const).map(
                        (key) => (
                          <div key={key} className="space-y-2">
                            <Label htmlFor={`${ad.id}-${key}`}>
                              {key === "body"
                                ? "Primary text"
                                : key === "headline"
                                  ? "Headline"
                                  : "Description"}
                            </Label>
                            {key === "body" ? (
                              <Textarea
                                id={`${ad.id}-${key}`}
                                rows={6}
                                maxLength={1200}
                                value={draftVideo[key]}
                                onChange={(e) =>
                                  setDraft({
                                    ...draftVideo,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              <Input
                                id={`${ad.id}-${key}`}
                                maxLength={key === "headline" ? 60 : 120}
                                value={draftVideo[key] ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draftVideo,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            )}
                          </div>
                        ),
                      )}
                    </>
                  )
                )}
                {actions}
              </div>
            ) : text ? (
              <div className="space-y-4">
                {(["headlines", "descriptions"] as const).map((kind) => (
                  <div key={kind}>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {kind === "headlines" ? "Headlines" : "Descriptions"} ·{" "}
                      {text[kind].length}/{kind === "headlines" ? 15 : 4}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {text[kind].map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              video && (
                <dl className="space-y-4 text-sm">
                  {(["headline", "description", "body"] as const).map((key) => (
                    <div key={key}>
                      <dt className="mb-1 text-xs text-muted-foreground">
                        {key === "body"
                          ? "Primary text"
                          : key === "headline"
                            ? "Headline"
                            : "Description"}
                      </dt>
                      <dd className="max-w-3xl whitespace-pre-wrap">
                        {video[key] || "Not set"}
                      </dd>
                    </div>
                  ))}
                </dl>
              )
            )}
          </section>
          <section className="space-y-4 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Destination</h4>
              {editButton("destination", "Edit destination")}
            </div>
            {editor === "destination" ? (
              <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                {targets.isPending ? (
                  <p role="status" className="text-xs">
                    Loading booking destinations…
                  </p>
                ) : targets.isError ? (
                  <Button variant="link" onClick={() => void targets.refetch()}>
                    Retry booking destinations
                  </Button>
                ) : (
                  Boolean(targets.data?.targets.length) && (
                    <div className="space-y-2">
                      <Label>Destination source</Label>
                      <Select
                        value={targetId ?? "manual"}
                        onValueChange={(id) => {
                          const next = targets.data?.targets.find(
                            (t) => t.id === id,
                          );
                          setTargetId(next?.id ?? null);
                          if (next?.url)
                            setDraft({ ...draft, linkUrl: next.url });
                        }}
                      >
                        <SelectTrigger aria-label="Destination source">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Enter a URL</SelectItem>
                          {targets.data?.targets.map((t) => (
                            <SelectItem
                              key={t.id}
                              value={t.id}
                              disabled={!t.url}
                            >
                              {t.name}
                              {t.issue ? ` · ${t.issue}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {target && (
                        <p className="text-xs text-muted-foreground">
                          Copies this target’s current booking link. Later
                          target changes leave the saved ad destination as
                          reviewed.
                        </p>
                      )}
                    </div>
                  )
                )}
                <div className="space-y-2">
                  <Label htmlFor={`${ad.id}-url`}>Destination URL</Label>
                  <Input
                    id={`${ad.id}-url`}
                    type="url"
                    value={draft.linkUrl ?? ""}
                    onChange={(e) => {
                      setDraft({ ...draft, linkUrl: e.target.value });
                      setTargetId(null);
                    }}
                  />
                </div>
                {draftVideo && (
                  <div className="space-y-2">
                    <Label>Call to action</Label>
                    <Select
                      value={draftVideo.callToAction || "none"}
                      onValueChange={(value) =>
                        setDraft({
                          ...draftVideo,
                          callToAction: value === "none" ? undefined : value,
                        })
                      }
                    >
                      <SelectTrigger aria-label="Call to action">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No button</SelectItem>
                        {draftVideo.callToAction &&
                          !ctas.some(
                            ([v]) => v === draftVideo.callToAction,
                          ) && (
                            <SelectItem value={draftVideo.callToAction}>
                              {draftVideo.callToAction}
                            </SelectItem>
                          )}
                        {ctas.map(([v, label]) => (
                          <SelectItem key={v} value={v}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {actions}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {target && (
                  <p className="text-xs text-muted-foreground">
                    Booking target · {target.name}
                  </p>
                )}
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    Destination URL
                  </p>
                  {safeHomeUrl(ad.content.linkUrl ?? website) ? (
                    <a
                      className="break-all underline underline-offset-4"
                      href={safeHomeUrl(ad.content.linkUrl ?? website)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {ad.content.linkUrl ?? website}
                    </a>
                  ) : (
                    "Not set"
                  )}
                </div>
                {video && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      Call to action
                    </p>
                    {ctas.find(([v]) => v === video.callToAction)?.[1] ??
                      video.callToAction ??
                      "No button"}
                  </div>
                )}
              </div>
            )}
          </section>
          {text ? (
            preview
          ) : (
            <section className="space-y-4 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium">Video</h4>
                {editButton("video", "Edit video")}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-4 @min-[44rem]/prepared-ad:grid-cols-2">
                {(["base", "story"] as const).map((slot) => {
                  const file = slot === "base" ? base : base?.story;
                  return (
                    <div key={slot} className="min-w-0 space-y-3">
                      <div>
                        <p className="text-sm font-medium">
                          {slot === "base" ? "Base video" : "Story / Reels cut"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {file
                            ? aspect(file)
                            : slot === "story"
                              ? "Optional · 9:16"
                              : "Choose a clip"}
                        </p>
                      </div>
                      {videoPreview(
                        file,
                        slot === "base" ? "Base video" : "Story cut",
                      )}
                      {editor === "video" && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || (slot === "story" && !base)}
                            onClick={() => setPicking(slot)}
                          >
                            Choose video
                          </Button>
                          {file && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                if (!draftVideo) return;
                                if (slot === "base")
                                  setDraft({ ...draftVideo, media: [] });
                                else {
                                  const { story: _old, ...item } =
                                    draftVideo.media[0]!;
                                  setDraft({ ...draftVideo, media: [item] });
                                }
                              }}
                            >
                              Remove {slot === "base" ? "video" : "cut"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                The base clip keeps its actual aspect ratio. A separate 9:16 cut
                is used for Stories and Reels.
              </p>
              {editor === "video" && actions}
            </section>
          )}
        </>
      )}
      <footer className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {!deliveryState && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete ad"
            disabled={busy || editor !== null}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy || editor !== null}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Close details" : locked ? "View details" : "Edit"}
        </Button>
        {!expanded && !approved && (
          <Button
            variant="outline"
            disabled={busy || status.isPending}
            onClick={() =>
              status.mutate({
                adId: ad.id,
                status: ready ? "drawn" : "ready",
                expectedUpdatedAt: ad.updatedAt,
              })
            }
          >
            {ready ? "Not ready" : "Mark ready"}
          </Button>
        )}
        {!expanded && !approved && (
          <Button
            disabled={
              busy ||
              (text
                ? !textAdReady(text) || !safeHomeUrl(text.linkUrl ?? website)
                : !video?.media.length ||
                  !video.headline.trim() ||
                  !video.body.trim() ||
                  !safeHomeUrl(video.linkUrl ?? website))
            }
            loading={status.isPending}
            onClick={() =>
              status.mutate({
                adId: ad.id,
                status: "approved",
                expectedUpdatedAt: ad.updatedAt,
              })
            }
          >
            Approve
          </Button>
        )}
        {!expanded && approved && (
          <Button
            variant="outline"
            disabled={busy || editApproved.isPending}
            loading={editApproved.isPending}
            onClick={() => editApproved.mutate({ adId: ad.id })}
          >
            Edit as new draft
          </Button>
        )}
      </footer>
      <DeleteAlert
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${ad.name}?`}
        description="Deletes this ad. Uploaded media stays in the library. This cannot be undone."
        onConfirm={() => remove.mutate({ adId: ad.id })}
        isLoading={remove.isPending}
      />
      {picking && (
        <MediaPickerDialog
          brandId={brandId}
          open
          kind="video"
          existingAssetIds={[]}
          onOpenChange={(open) => !open && setPicking(null)}
          onPick={(item) => {
            if (!draftVideo || !item.assetId) return;
            if (picking === "base")
              setDraft({
                ...draftVideo,
                media: [
                  { ...item, type: "video", story: draftVideo.media[0]?.story },
                ],
              });
            else if (draftVideo.media[0])
              setDraft({
                ...draftVideo,
                media: [
                  { ...draftVideo.media[0], story: { ...item, via: "upload" } },
                ],
              });
            setPicking(null);
          }}
        />
      )}
    </article>
  );
}
