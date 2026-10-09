"use client";

import { useRouter } from "next/navigation";
import { PitchMediaPicker, type PitchAssetTarget } from "./PitchMediaPicker";
import { WebsiteMediaSuggestions } from "@/app/app/media/WebsiteMediaSuggestions";
import { PitchChatButton } from "../../../PitchChatButton";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SimpleDialog } from "@/components/ui/dialog";
import { PitchVisualPreview, PitchAsset } from "./PitchVisualPreview";
import { resolvePitchFields, selectPitchHomes } from "@/lib/pitch-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import {
  EMPTY_PITCH,
  STANDARD_PITCH_DEFAULTS,
  pitchFieldsSchema,
  type PitchFields,
  type PitchSettings,
} from "@/lib/pitch-settings";

type Copy = Pick<
  PitchFields,
  "pageHeadline" | "pageSubtitle" | "headline" | "caption"
>;
type Brand = {
  id: string;
  name: string;
  website: string | null;
  logo: string | null;
  pitchSettings: PitchSettings | null;
  resolved: PitchFields;
};
export function PitchEditor({
  brand,
  pitchUrl,
  homes,
  media,
}: {
  brand: Brand;
  pitchUrl: string | null;
  homes: { name: string; urlKey: string; heroSourceUrl: string | null }[];
  media: { id: string; title: string | null; url: string | null }[];
}) {
  const router = useRouter();
  const [assetTarget, setAssetTarget] = useState<PitchAssetTarget | null>(null);
  const initial = pitchFieldsSchema.parse(brand.pitchSettings ?? EMPTY_PITCH);
  const [editing, setEditing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fields, setFields] = useState<PitchFields>(initial);
  const [saved, setSaved] = useState(initial);
  const [revision, setRevision] = useState(brand.pitchSettings?.revision ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState<Copy | null>(null);
  const [undo, setUndo] = useState<PitchFields | null>(null);
  const [savedAt, setSavedAt] = useState(
    brand.pitchSettings?.updatedAt ?? null,
  );
  const dirty = JSON.stringify(fields) !== JSON.stringify(saved);
  useEffect(() => {
    const external = brand.pitchSettings;
    if (!dirty && external && external.revision > revision) {
      const next = pitchFieldsSchema.parse(external);
      setFields(next);
      setSaved(next);
      setRevision(external.revision);
      setSavedAt(external.updatedAt);
    }
  }, [brand.pitchSettings, dirty, revision]);
  const load = useQuery({
    ...orpc.performance.pitch.queryOptions({ input: { brandId: brand.id } }),
    enabled: false,
  });
  const save = useMutation(
    orpc.performance.savePitch.mutationOptions({
      onSuccess: (result) => {
        const next = pitchFieldsSchema.parse(result);
        setFields(next);
        setSaved(next);
        setRevision(result.revision);
        setSavedAt(result.updatedAt);
        setError(null);
        setEditing(false);
        toast.success("Live pitch updated");
        router.refresh();
      },
      onError: (cause) => setError(cause.message),
    }),
  );
  const draft = useMutation(
    orpc.performance.draftPitch.mutationOptions({
      onSuccess: setSuggestion,
      onError: (cause) => setError(cause.message),
    }),
  );
  const createUpload = useMutation(
    orpc.media.createUploadUrl.mutationOptions(),
  );
  const finalize = useMutation(orpc.media.finalizeUpload.mutationOptions());
  const failUpload = useMutation(orpc.media.failUpload.mutationOptions());
  const taxonomy = useQuery({
    ...orpc.media.taxonomy.queryOptions({ input: { brandId: brand.id } }),
    enabled: false,
  });
  const createFolder = useMutation(orpc.media.createFolder.mutationOptions());
  const organize = useMutation(orpc.media.updateMeta.mutationOptions());
  const busy = save.isPending || draft.isPending || uploading;
  const patch = (value: Partial<PitchFields>) =>
    setFields((current) => ({ ...current, ...value }));
  const upload = async (file: File, target: "photo" | "logo" | "hero") => {
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
      setError("Choose an image under 20 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    let mediaId: string | undefined;
    let finalized = false;
    try {
      const slot = await createUpload.mutateAsync({
        brandId: brand.id,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      });
      mediaId = slot.mediaId;
      const response = await fetch(slot.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok)
        throw new Error("Image upload failed. Please try again.");
      await finalize.mutateAsync({
        mediaId: slot.mediaId,
        url: slot.publicUrl,
        pathname: slot.pathname,
      });
      finalized = true;
      // Organizing is best effort: a library failure must not undo a completed upload.
      try {
        const folders = await taxonomy.refetch();
        let folder = folders.data?.folders.find(
          (item) => item.name === "Pitch",
        );
        if (!folder) {
          try {
            folder = await createFolder.mutateAsync({
              brandId: brand.id,
              name: "Pitch",
            });
          } catch {
            folder = (await taxonomy.refetch()).data?.folders.find(
              (item) => item.name === "Pitch",
            );
          }
        }
        if (!folder) throw new Error("Folder unavailable");
        await organize.mutateAsync({ id: slot.mediaId, folderId: folder.id });
      } catch {
        toast.error(
          "Image uploaded, but could not organize it into the Pitch folder.",
        );
      }
      if (target === "logo") patch({ logoUrl: slot.publicUrl });
      else if (target === "hero")
        patch({ heroMedia: { url: slot.publicUrl, kind: "image" } });
      else
        setFields((current) => ({
          ...current,
          imageUrls: [...current.imageUrls, slot.publicUrl].slice(0, 3),
        }));
    } catch (cause) {
      if (mediaId && !finalized)
        await failUpload
          .mutateAsync({ mediaId, reason: "Pitch image upload failed" })
          .catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };
  const textFields = [
    ["brandName", "Display name", brand.name],
    ["pageHeadline", "Page headline", "Our marketing machine, now yours"],
    [
      "pageSubtitle",
      "Page introduction",
      "Leave blank to use the standard pitch introduction",
    ],
    ["headline", "Ad headline", "A stay worth talking about"],
    ["caption", "Ad caption", "Leave blank to use the standard ad caption"],
    ["location", "Market / location", "Use the homes’ location"],
    ["logoUrl", "Logo URL", brand.logo ?? "https://…"],
    ["iconUrl", "Icon URL", "https://…"],
  ] as const;
  const defaults: Record<(typeof textFields)[number][0], string> = {
    ...brand.resolved,
    brandName: brand.name,
    location: "Determined from the selected homes on the live page",
    logoUrl: brand.logo ?? "No brand logo available",
    iconUrl: "Uses the brand icon, with the logo as fallback",
  };
  const previewUrl = pitchUrl
    ? `${pitchUrl}?pitchRevision=${revision}&noping=1`
    : null;
  const visibleFields = editing ? fields : saved;
  const resolved = resolvePitchFields(
    visibleFields,
    { ...brand, icon: brand.resolved.iconUrl },
    brand.resolved.location,
  );
  const selectedHomes = selectPitchHomes(
    homes.map((home) => ({ ...home, url: home.urlKey })),
    visibleFields.selectedHomeUrls,
  );
  const photos = visibleFields.imageUrls.length
    ? visibleFields.imageUrls
    : selectedHomes
        .map((home) => home.heroSourceUrl)
        .filter((url): url is string => Boolean(url))
        .slice(0, 3);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Shape the pitch</h3>
          <p className="text-sm text-muted-foreground">
            {dirty
              ? "Unsaved changes"
              : savedAt
                ? `Saved ${new Date(savedAt).toLocaleString()}`
                : "Using brand information and standard pitch defaults"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PitchChatButton brandId={brand.id} name={brand.name} />
          {pitchUrl && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(pitchUrl)
                    .then(() => toast.success("Pitch link copied"))
                    .catch(() =>
                      setError(
                        "Could not copy the link. Open the preview to copy its URL.",
                      ),
                    )
                }
              >
                Copy pitch link
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={`${pitchUrl}?noping=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open live pitch
                </a>
              </Button>
              <Button variant="outline" onClick={() => setExportOpen(true)}>
                Export PDF / PNG
              </Button>
            </>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (editing) {
                const latest =
                  brand.pitchSettings && brand.pitchSettings.revision > revision
                    ? pitchFieldsSchema.parse(brand.pitchSettings)
                    : saved;
                setFields(latest);
                setSaved(latest);
                if (
                  brand.pitchSettings &&
                  brand.pitchSettings.revision > revision
                ) {
                  setRevision(brand.pitchSettings.revision);
                  setSavedAt(brand.pitchSettings.updatedAt);
                }
                setSuggestion(null);
                setUndo(null);
                setError(null);
              }
              setEditing(!editing);
            }}
          >
            {editing ? "Discard edits" : "Edit manually"}
          </Button>
          {editing && (
            <Button
              disabled={!dirty || busy}
              onClick={() => {
                setError(null);
                const result = pitchFieldsSchema.safeParse(fields);
                if (!result.success) {
                  setError(
                    result.error.issues[0]?.message ??
                      "Check your pitch fields",
                  );
                  return;
                }
                save.mutate({
                  brandId: brand.id,
                  fields: result.data,
                });
              }}
            >
              {save.isPending ? "Saving…" : "Save live pitch"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {editing
          ? "Save updates the live pitch. Unchanged defaults stay automatic; use Reset to default to remove an override. Proposed pricing changes this pitch only."
          : "Review the saved pitch below or open it in chat to make changes. Defaults follow brand information and the standard pitch until explicitly overridden."}
      </p>
      {error && (
        <div className="space-y-2 rounded-xl border border-border p-4">
          <p role="alert">{error}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const result = await load.refetch();
              if (result.data) {
                const next = pitchFieldsSchema.parse(
                  result.data.pitchSettings ?? EMPTY_PITCH,
                );
                setFields(next);
                setSaved(next);
                setRevision(result.data.pitchSettings?.revision ?? 0);
                setSavedAt(result.data.pitchSettings?.updatedAt ?? null);
                setSuggestion(null);
                setUndo(null);
                setError(null);
              }
            }}
          >
            Reload saved pitch (discard edits)
          </Button>
        </div>
      )}
      {!editing && (
        <section className="space-y-5 rounded-2xl border bg-card p-5">
          <h4 className="font-medium">Saved pitch details</h4>
          <dl className="grid grid-cols-1 gap-5 @2xl:grid-cols-2">
            {textFields.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <dt className="text-sm font-medium">
                  {key === "logoUrl"
                    ? "Logo"
                    : key === "iconUrl"
                      ? "Icon"
                      : label}{" "}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {saved[key]
                      ? "Pitch override"
                      : key === "brandName" ||
                          key === "logoUrl" ||
                          key === "iconUrl"
                        ? "From brand"
                        : key === "location"
                          ? "Automatic"
                          : "Default"}
                  </span>
                </dt>
                <dd className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
                  {key === "logoUrl" || key === "iconUrl" ? (
                    <PitchAsset
                      url={resolved[key]}
                      label={key === "logoUrl" ? "Brand logo" : "Brand icon"}
                    />
                  ) : (
                    saved[key] || defaults[key]
                  )}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-sm font-medium">
                Proposed monthly management fee{" "}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {saved.managementFeeDollars === null
                    ? "Default"
                    : "Pitch override"}
                </span>
              </dt>
              <dd className="text-sm text-muted-foreground">
                $
                {(
                  saved.managementFeeDollars ??
                  STANDARD_PITCH_DEFAULTS.managementFeeDollars
                ).toLocaleString()}{" "}
                / month
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Homes</dt>
              <dd className="text-sm text-muted-foreground">
                {saved.selectedHomeUrls.length
                  ? `${saved.selectedHomeUrls.length} selected homes`
                  : "All available homes · automatic"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Featured photos</dt>
              <dd className="text-sm text-muted-foreground">
                {saved.imageUrls.length
                  ? `${saved.imageUrls.length} selected photos`
                  : "Photos from the selected homes · automatic"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Hero background</dt>
              <dd className="text-sm break-words text-muted-foreground">
                {saved.heroMedia?.url ?? "Standard pitch background · default"}
              </dd>
            </div>
          </dl>
        </section>
      )}
      {editing && (
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
          <fieldset disabled={busy} className="min-w-0 space-y-6">
            <section className="space-y-4 rounded-2xl border bg-card p-5">
              {textFields.map(([key, label, placeholder]) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`pitch-${key}`}>{label}</Label>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={!fields[key]}
                      onClick={() => patch({ [key]: "" })}
                    >
                      Reset to default
                    </Button>
                  </div>
                  {key === "caption" || key === "pageSubtitle" ? (
                    <Textarea
                      id={`pitch-${key}`}
                      value={fields[key] || defaults[key]}
                      placeholder={placeholder}
                      maxLength={key === "caption" ? 1500 : 600}
                      onChange={(event) => patch({ [key]: event.target.value })}
                    />
                  ) : (
                    <Input
                      id={`pitch-${key}`}
                      value={
                        fields[key] ||
                        (key === "location" ||
                        key === "iconUrl" ||
                        (key === "logoUrl" && !brand.logo)
                          ? ""
                          : defaults[key])
                      }
                      placeholder={placeholder}
                      onChange={(event) => patch({ [key]: event.target.value })}
                    />
                  )}
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="pitch-fee">
                  Proposed monthly management fee ($)
                </Label>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={fields.managementFeeDollars === null}
                  onClick={() => patch({ managementFeeDollars: null })}
                >
                  Reset to default
                </Button>
                <Input
                  id="pitch-fee"
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  placeholder="2500 (standard)"
                  value={
                    fields.managementFeeDollars ??
                    STANDARD_PITCH_DEFAULTS.managementFeeDollars
                  }
                  onChange={(event) =>
                    patch({
                      managementFeeDollars:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </div>
              <Label className="block">
                Upload logo
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, "logo");
                    event.target.value = "";
                  }}
                />
              </Label>
            </section>
            <section className="space-y-3 rounded-2xl border bg-card p-5">
              <h4 className="font-medium">Featured photos</h4>
              <p className="text-sm text-muted-foreground">
                Choose up to three. Leave empty to use the selected homes’
                photos.
              </p>
              {fields.imageUrls.map((url, index) => (
                <div key={url} className="flex items-center gap-3">
                  <img
                    src={url}
                    alt={`Featured photo ${index + 1}`}
                    className="h-14 w-20 rounded-lg object-cover"
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      patch({
                        imageUrls: fields.imageUrls.filter(
                          (item) => item !== url,
                        ),
                      })
                    }
                  >
                    Remove photo {index + 1}
                  </Button>
                </div>
              ))}
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Choose from the brand’s media library
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2 @xl:grid-cols-3">
                  {media
                    .filter((item) => item.url?.startsWith("https:"))
                    .map((item) => {
                      const selected = fields.imageUrls.includes(item.url!);
                      return (
                        <button
                          type="button"
                          key={item.id}
                          aria-pressed={selected}
                          aria-label={`Select ${item.title ?? "library photo"}`}
                          disabled={!selected && fields.imageUrls.length >= 3}
                          className={`overflow-hidden rounded-lg border p-1 text-left disabled:opacity-40 ${selected ? "ring-2 ring-ring" : ""}`}
                          onClick={() =>
                            patch({
                              imageUrls: selected
                                ? fields.imageUrls.filter(
                                    (url) => url !== item.url,
                                  )
                                : [...fields.imageUrls, item.url!],
                            })
                          }
                        >
                          <img
                            src={item.url!}
                            alt={item.title ?? "Library photo"}
                            loading="lazy"
                            className="aspect-video w-full rounded object-cover"
                          />
                          <span className="block truncate p-1 text-xs">
                            {selected ? "Selected · " : ""}
                            {item.title ?? "Library photo"}
                          </span>
                        </button>
                      );
                    })}
                </div>
                {!media.length && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No library photos yet. Upload a photo below.
                  </p>
                )}
              </details>
              <Label className="block">
                Upload photo
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={fields.imageUrls.length >= 3}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, "photo");
                    event.target.value = "";
                  }}
                />
              </Label>
            </section>
            <section className="space-y-3 rounded-2xl border bg-card p-5">
              <h4 className="font-medium">Hero background</h4>
              <Input
                aria-label="Hero media URL"
                placeholder="https://… (image or video)"
                value={fields.heroMedia?.url ?? ""}
                onChange={(event) =>
                  patch({
                    heroMedia: event.target.value
                      ? {
                          url: event.target.value,
                          kind: /\.(mp4|webm|mov)(\?|$)/i.test(
                            event.target.value,
                          )
                            ? "video"
                            : "image",
                        }
                      : null,
                  })
                }
              />
              <Label className="block">
                Upload hero image
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, "hero");
                    event.target.value = "";
                  }}
                />
              </Label>
            </section>
            <section className="space-y-3 rounded-2xl border bg-card p-5">
              <h4 className="font-medium">Homes in this pitch</h4>
              <p className="text-sm text-muted-foreground">
                No selection uses all available homes.
              </p>
              {homes
                .filter((home) => home.urlKey.startsWith("https:"))
                .map((home) => (
                  <label
                    key={home.urlKey}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={fields.selectedHomeUrls.includes(home.urlKey)}
                      onChange={(event) =>
                        patch({
                          selectedHomeUrls: event.target.checked
                            ? [...fields.selectedHomeUrls, home.urlKey]
                            : fields.selectedHomeUrls.filter(
                                (url) => url !== home.urlKey,
                              ),
                        })
                      }
                    />
                    {home.name}
                  </label>
                ))}
              {!homes.length && (
                <p className="text-sm text-muted-foreground">
                  Homes are discovered from their booking site when the live
                  pitch loads. You can add homes in the Setup tab.
                </p>
              )}
            </section>
          </fieldset>
          <div className="min-w-0 space-y-5">
            <section className="space-y-3 rounded-2xl border bg-card p-5">
              <h4 className="font-medium">Shape the copy with AI</h4>
              <Textarea
                aria-label="Pitch revision request"
                placeholder="Focus on their South Dakota homes and make the copy less corporate…"
                value={instruction}
                disabled={busy}
                onChange={(event) => setInstruction(event.target.value)}
                maxLength={2000}
              />
              <Button
                disabled={busy || instruction.trim().length < 3}
                variant="outline"
                onClick={() => {
                  setError(null);
                  setSuggestion(null);
                  draft.mutate({ brandId: brand.id, instruction, fields });
                }}
              >
                {draft.isPending ? "Drafting…" : "Suggest changes"}
              </Button>
              {suggestion && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-sm text-muted-foreground">
                    Suggestions — review before applying.
                  </p>
                  {Object.entries(suggestion).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs font-medium text-muted-foreground">
                        {textFields.find(([field]) => field === key)?.[1]}
                      </p>
                      <p className="text-sm">{value}</p>
                    </div>
                  ))}
                  <Button
                    onClick={() => {
                      setUndo(fields);
                      patch(suggestion);
                      setSuggestion(null);
                    }}
                  >
                    Apply to editor
                  </Button>
                </div>
              )}
              {undo && (
                <Button
                  disabled={busy}
                  variant="ghost"
                  onClick={() => {
                    setFields(undo);
                    setUndo(null);
                  }}
                >
                  Undo applied suggestion
                </Button>
              )}
            </section>
            {previewUrl && (
              <section className="space-y-2">
                <h4 className="font-medium">Saved pitch summary</h4>
                <p className="text-sm text-muted-foreground">
                  The summary shows saved changes. Open the live pitch to view
                  the complete page, or use Export PDF / PNG for an attachment.
                </p>
                <div className="space-y-4 rounded-2xl border bg-card p-6">
                  {(saved.imageUrls[0] || homes[0]?.heroSourceUrl) && (
                    <img
                      src={saved.imageUrls[0] || homes[0]?.heroSourceUrl || ""}
                      alt="Saved pitch featured photo"
                      className="aspect-video w-full rounded-xl object-cover"
                    />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {saved.brandName || brand.name}
                  </p>
                  <h4 className="text-2xl font-semibold">
                    {saved.pageHeadline || "Our marketing machine, now yours"}
                  </h4>
                  {saved.pageSubtitle && <p>{saved.pageSubtitle}</p>}
                  <p className="font-medium">
                    {saved.headline || "A stay worth talking about"}
                  </p>
                  {saved.caption && (
                    <p className="text-sm text-muted-foreground">
                      {saved.caption}
                    </p>
                  )}
                  <p className="text-sm">
                    Proposed management fee: $
                    {(
                      saved.managementFeeDollars ??
                      STANDARD_PITCH_DEFAULTS.managementFeeDollars
                    ).toLocaleString()}{" "}
                    / month
                  </p>
                  <Button variant="outline" asChild>
                    <a href={previewUrl} target="_blank" rel="noreferrer">
                      Preview full saved page →
                    </a>
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {!editing && <WebsiteMediaSuggestions brandId={brand.id} />}
      {assetTarget && (
        <PitchMediaPicker
          key={assetTarget}
          brandId={brand.id}
          target={assetTarget}
          selected={
            assetTarget === "photos"
              ? saved.imageUrls
              : assetTarget === "hero"
                ? saved.heroMedia
                  ? [saved.heroMedia.url]
                  : []
                : [
                    assetTarget === "logo" ? saved.logoUrl : saved.iconUrl,
                  ].filter(Boolean)
          }
          onClose={() => setAssetTarget(null)}
          onSave={async (urls) => {
            const latest = await load.refetch();
            if (!latest.data)
              throw new Error("Could not load the current pitch. Try again.");
            const next = pitchFieldsSchema.parse(
              latest.data.pitchSettings ?? EMPTY_PITCH,
            );
            if (assetTarget === "photos") next.imageUrls = urls;
            else if (assetTarget === "hero")
              next.heroMedia = urls[0] ? { url: urls[0], kind: "image" } : null;
            else if (assetTarget === "logo") next.logoUrl = urls[0] ?? "";
            else next.iconUrl = urls[0] ?? "";
            await save.mutateAsync({
              brandId: brand.id,
              fields: next,
            });
          }}
        />
      )}
      <PitchVisualPreview
        onChooseAsset={!editing && !busy ? setAssetTarget : undefined}
        fields={resolved}
        photos={photos}
        editing={editing}
        automaticPhotos={!visibleFields.imageUrls.length}
      />
      {pitchUrl && (
        <SimpleDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          title="Export saved pitch"
          description="Download the saved page. Save any manual edits before exporting."
          size="xl"
        >
          <iframe
            src={`${pitchUrl}/preview?key=wanderplus&exportPanel=1&pitchRevision=${Math.max(revision, brand.pitchSettings?.revision ?? 0)}&noping=1`}
            title="Pitch PDF and PNG downloads"
            className="h-[360px] w-full rounded-xl border bg-white"
          />
        </SimpleDialog>
      )}
      {pitchUrl && (
        <section className="mt-8 space-y-3">
          <h3 className="text-xl font-semibold">Live pitch preview</h3>
          <p className="text-sm text-muted-foreground">
            Shows the saved pitch your prospect sees. Save your edits to refresh
            it.
          </p>
          <iframe
            key={Math.max(revision, brand.pitchSettings?.revision ?? 0)}
            src={`${pitchUrl}/preview?pitchRevision=${Math.max(revision, brand.pitchSettings?.revision ?? 0)}&noping=1`}
            title={`${brand.name} live pitch`}
            loading="lazy"
            className="h-[800px] w-full rounded-2xl border bg-background"
          />
        </section>
      )}
    </div>
  );
}
