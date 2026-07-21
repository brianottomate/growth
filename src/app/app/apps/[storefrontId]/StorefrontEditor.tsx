"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  FileJson,
  Image as ImageIcon,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  storefrontContentSchema,
  storefrontListingStatuses,
  storefrontSurfaceRegistry,
  type StorefrontContent,
} from "@/lib/product-atlas";
import { cn } from "@/lib/utils";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

import { StorefrontPreview } from "./StorefrontPreview";

type Storefront = RouterOutputs["productStorefront"]["getStorefront"];
type Editors = RouterOutputs["productStorefront"]["listEditors"];
type Assets = RouterOutputs["productStorefront"]["listBrandAssets"];
type Sibling =
  RouterOutputs["productStorefront"]["getProduct"]["storefronts"][number];
type Tab = "content" | "preview" | "assets" | "json" | "history";
type PickerTarget = "icon" | "screenshot" | "promotional" | "video";

const itemId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

export function StorefrontEditor({
  storefront,
  editors,
  assets,
  siblings,
}: {
  storefront: Storefront;
  editors: Editors;
  assets: Assets;
  siblings: Sibling[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("content");
  const [content, setContent] = useState<StorefrontContent>(storefront.content);
  const [rawJson, setRawJson] = useState(
    JSON.stringify(storefront.content, null, 2),
  );
  const [externalListingId, setExternalListingId] = useState(
    storefront.externalListingId ?? "",
  );
  const [publicUrl, setPublicUrl] = useState(storefront.publicUrl ?? "");
  const [managementUrl, setManagementUrl] = useState(
    storefront.managementUrl ?? "",
  );
  const [localizedContentUrl, setLocalizedContentUrl] = useState(
    storefront.localizedContentUrl ?? "",
  );
  const [listingStatus, setListingStatus] = useState(storefront.listingStatus);
  const [staleNote, setStaleNote] = useState(storefront.staleNote ?? "");
  const [confirmNote, setConfirmNote] = useState("");
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [siblingId, setSiblingId] = useState(siblings[0]?.id ?? "");

  const refresh = (message: string) => {
    toast.success(message);
    router.refresh();
  };
  const updateMutation = useMutation(
    trpc.productStorefront.updateStorefront.mutationOptions({
      onSuccess: () => refresh("Saved and marked stale"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const staleMutation = useMutation(
    trpc.productStorefront.markStale.mutationOptions({
      onSuccess: () => refresh("Marked stale"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const confirmMutation = useMutation(
    trpc.productStorefront.confirmUpToDate.mutationOptions({
      onSuccess: () => refresh("Confirmed up to date"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const managerMutation = useMutation(
    trpc.productStorefront.assignManager.mutationOptions({
      onSuccess: () => refresh("Manager updated"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const copyMutation = useMutation(
    trpc.productStorefront.copySiblingContent.mutationOptions({
      onSuccess: () => refresh("Sibling content copied and marked stale"),
      onError: (error) => toast.error(error.message),
    }),
  );

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  const setNextContent = (next: StorefrontContent) => {
    setContent(next);
    setRawJson(JSON.stringify(next, null, 2));
  };

  const save = () => {
    const parsed = storefrontContentSchema.safeParse(content);
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0]?.message ?? "Invalid content");
    }
    if (!staleNote.trim()) {
      return toast.error("Describe what needs updating on the storefront");
    }
    updateMutation.mutate({
      storefrontId: storefront.id,
      expectedUpdatedAt: storefront.updatedAt.toISOString(),
      staleNote,
      externalListingId: externalListingId.trim() || null,
      publicUrl: publicUrl.trim() || null,
      managementUrl: managementUrl.trim() || null,
      localizedContentUrl: localizedContentUrl.trim() || null,
      listingStatus,
      content: parsed.data,
    });
  };

  const surface = storefrontSurfaceRegistry[storefront.surface];

  return (
    <main className="space-y-6">
      <Link
        href="/app/apps"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" /> Apps & storefronts
      </Link>

      <header className="space-y-4 border-b pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs">
              {storefront.product.brand.name} ·{" "}
              {surface.family.replaceAll("_", " ")}
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
              {storefront.product.name} · {surface.shortLabel}
            </h1>
          </div>
          <Freshness status={storefront.freshnessStatus} />
        </div>
        {storefront.staleNote && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              External update needed
            </p>
            <p className="mt-1 text-sm">{storefront.staleNote}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {storefront.publicUrl && (
            <ExternalLinkButton
              href={storefront.publicUrl}
              label="Public listing"
            />
          )}
          {storefront.managementUrl && (
            <ExternalLinkButton
              href={storefront.managementUrl}
              label="Management console"
            />
          )}
          {storefront.localizedContentUrl && (
            <ExternalLinkButton
              href={storefront.localizedContentUrl}
              label="Localized content"
            />
          )}
          <Link
            href={`/app/product-atlas/${storefront.productId}`}
            className="rounded-lg border px-3 py-2 text-xs"
          >
            Product Atlas
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">Manager</span>
          <select
            value={storefront.managerUserId ?? ""}
            onChange={(event) =>
              managerMutation.mutate({
                storefrontId: storefront.id,
                expectedUpdatedAt: storefront.updatedAt.toISOString(),
                managerUserId: event.target.value || null,
              })
            }
            className="bg-background w-full rounded-lg border px-3 py-2"
          >
            <option value="">No manager</option>
            {editors.map((editor) => (
              <option key={editor.id} value={editor.id}>
                {editor.name ?? editor.email}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">
            Listing status
          </span>
          <select
            value={listingStatus}
            onChange={(event) =>
              setListingStatus(
                event.target
                  .value as (typeof storefrontListingStatuses)[number],
              )
            }
            className="bg-background w-full rounded-lg border px-3 py-2"
          >
            {storefrontListingStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </section>

      <nav className="flex gap-1 border-b">
        {(["content", "preview", "assets", "json", "history"] as Tab[]).map(
          (item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                "border-b-2 px-3 py-2 text-xs font-medium capitalize",
                tab === item
                  ? "border-foreground"
                  : "text-muted-foreground border-transparent",
              )}
            >
              {item}
            </button>
          ),
        )}
      </nav>

      {tab === "content" && (
        <ContentFields
          content={content}
          setContent={setNextContent}
          links={{
            externalListingId,
            publicUrl,
            managementUrl,
            localizedContentUrl,
          }}
          setLink={(key, value) => {
            if (key === "externalListingId") setExternalListingId(value);
            if (key === "publicUrl") setPublicUrl(value);
            if (key === "managementUrl") setManagementUrl(value);
            if (key === "localizedContentUrl") setLocalizedContentUrl(value);
          }}
        />
      )}
      {tab === "preview" && (
        <StorefrontPreview
          content={content}
          surface={storefront.surface}
          listingStatus={listingStatus}
          assets={assets}
        />
      )}
      {tab === "assets" && (
        <AssetFields
          content={content}
          setContent={setNextContent}
          assetById={assetById}
          openPicker={setPickerTarget}
        />
      )}
      {tab === "json" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <FileJson className="size-4" />
            <h2 className="font-semibold">Advanced storefront JSON</h2>
          </div>
          <textarea
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            spellCheck={false}
            className="bg-muted/30 min-h-[520px] w-full rounded-xl border p-4 font-mono text-xs"
          />
          <button
            onClick={() => {
              try {
                const parsed = storefrontContentSchema.parse(
                  JSON.parse(rawJson),
                );
                setNextContent(parsed);
                toast.success("JSON applied to the draft");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Invalid JSON",
                );
              }
            }}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Validate and apply
          </button>
        </section>
      )}
      {tab === "history" && (
        <section className="space-y-2">
          {[...storefront.changelog].reverse().map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className="bg-card rounded-xl border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium">
                  {entry.action.replaceAll("_", " ")}
                </p>
                <time className="text-muted-foreground text-[10px]">
                  {new Date(entry.at).toLocaleString()}
                </time>
              </div>
              {entry.note && <p className="mt-2 text-sm">{entry.note}</p>}
              <p className="text-muted-foreground mt-2 text-[10px]">
                {entry.actorName ?? entry.actorKind}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-4 border-t pt-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            What needs updating externally?
          </span>
          <textarea
            value={staleNote}
            onChange={(event) => setStaleNote(event.target.value)}
            placeholder="Describe the copy, asset, or link change an employee or agent must make."
            className="bg-background min-h-20 w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={updateMutation.isPending}
            className="bg-foreground text-background inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Save className="size-4" /> Save and mark stale
          </button>
          <button
            onClick={() => {
              if (!staleNote.trim()) return toast.error("Add a stale note");
              staleMutation.mutate({
                storefrontId: storefront.id,
                expectedUpdatedAt: storefront.updatedAt.toISOString(),
                note: staleNote,
              });
            }}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
          >
            <TriangleAlert className="size-4" /> Mark stale only
          </button>
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <label className="text-xs">
            <span className="mb-1 block font-medium">
              Confirmation note (optional)
            </span>
            <input
              value={confirmNote}
              onChange={(event) => setConfirmNote(event.target.value)}
              className="bg-background w-full rounded-lg border px-3 py-2"
              placeholder="Updated screenshots and description in the store UI."
            />
          </label>
          <button
            onClick={() =>
              confirmMutation.mutate({
                storefrontId: storefront.id,
                expectedUpdatedAt: storefront.updatedAt.toISOString(),
                note: confirmNote || undefined,
              })
            }
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 className="size-4" /> Confirm external storefront is
            current
          </button>
        </div>

        {siblings.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border p-4">
            <label className="min-w-52 flex-1 text-xs">
              <span className="text-muted-foreground mb-1 block">
                Copy content from sibling surface
              </span>
              <select
                value={siblingId}
                onChange={(event) => setSiblingId(event.target.value)}
                className="bg-background w-full rounded-lg border px-3 py-2"
              >
                {siblings.map((sibling) => (
                  <option key={sibling.id} value={sibling.id}>
                    {storefrontSurfaceRegistry[sibling.surface].label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                if (!staleNote.trim()) return toast.error("Add a stale note");
                copyMutation.mutate({
                  sourceStorefrontId: siblingId,
                  targetStorefrontId: storefront.id,
                  expectedTargetUpdatedAt: storefront.updatedAt.toISOString(),
                  staleNote,
                });
              }}
              className="rounded-lg border px-3 py-2 text-xs"
            >
              Copy and mark stale
            </button>
          </div>
        )}
      </section>

      {pickerTarget && (
        <AssetPicker
          target={pickerTarget}
          assets={assets}
          onClose={() => setPickerTarget(null)}
          onPick={(assetId) => {
            if (pickerTarget === "icon") {
              setNextContent({ ...content, iconMediaAssetId: assetId });
            }
            if (pickerTarget === "screenshot") {
              setNextContent({
                ...content,
                screenshots: [
                  ...content.screenshots,
                  {
                    id: itemId("shot"),
                    mediaAssetId: assetId,
                    order: content.screenshots.length,
                    presentation: "product_ui",
                  },
                ],
              });
            }
            if (pickerTarget === "promotional") {
              setNextContent({
                ...content,
                promotionalAssets: [
                  ...content.promotionalAssets,
                  {
                    id: itemId("promo"),
                    mediaAssetId: assetId,
                    role: "feature_graphic",
                    order: content.promotionalAssets.length,
                  },
                ],
              });
            }
            if (pickerTarget === "video") {
              setNextContent({
                ...content,
                videos: [
                  ...content.videos,
                  {
                    id: itemId("video"),
                    mediaAssetId: assetId,
                    role: "product_demo",
                    order: content.videos.length,
                  },
                ],
              });
            }
            setPickerTarget(null);
          }}
        />
      )}
    </main>
  );
}

function ContentFields({
  content,
  setContent,
  links,
  setLink,
}: {
  content: StorefrontContent;
  setContent: (content: StorefrontContent) => void;
  links: Record<
    "externalListingId" | "publicUrl" | "managementUrl" | "localizedContentUrl",
    string
  >;
  setLink: (key: keyof typeof links, value: string) => void;
}) {
  const copy = content.copy;
  const positioning = content.positioning;
  return (
    <section className="space-y-6">
      <FieldGrid title="External identity and links">
        <TextField
          label="External listing ID"
          value={links.externalListingId}
          onChange={(value) => setLink("externalListingId", value)}
        />
        <TextField
          label="Public URL"
          value={links.publicUrl}
          onChange={(value) => setLink("publicUrl", value)}
        />
        <TextField
          label="Management URL"
          value={links.managementUrl}
          onChange={(value) => setLink("managementUrl", value)}
        />
        <TextField
          label="Localized content URL"
          value={links.localizedContentUrl}
          onChange={(value) => setLink("localizedContentUrl", value)}
        />
      </FieldGrid>
      <FieldGrid title="Positioning">
        <TextArea
          label="Audience"
          value={positioning.audience}
          onChange={(value) =>
            setContent({
              ...content,
              positioning: { ...positioning, audience: value },
            })
          }
        />
        <TextArea
          label="Value proposition"
          value={positioning.valueProposition}
          onChange={(value) =>
            setContent({
              ...content,
              positioning: { ...positioning, valueProposition: value },
            })
          }
        />
        <TextField
          label="Category"
          value={positioning.category}
          onChange={(value) =>
            setContent({
              ...content,
              positioning: { ...positioning, category: value },
            })
          }
        />
        <TextField
          label="Key messages"
          hint="Comma separated"
          value={positioning.keyMessages.join(", ")}
          onChange={(value) =>
            setContent({
              ...content,
              positioning: { ...positioning, keyMessages: splitList(value) },
            })
          }
        />
      </FieldGrid>
      <FieldGrid title="Storefront copy">
        <TextField
          label="Display name"
          value={copy.displayName}
          onChange={(value) =>
            setContent({ ...content, copy: { ...copy, displayName: value } })
          }
        />
        <TextField
          label="Tagline"
          value={copy.tagline}
          onChange={(value) =>
            setContent({ ...content, copy: { ...copy, tagline: value } })
          }
        />
        <TextArea
          label="Short description"
          value={copy.shortDescription}
          onChange={(value) =>
            setContent({
              ...content,
              copy: { ...copy, shortDescription: value },
            })
          }
        />
        <TextArea
          label="Long description"
          value={copy.longDescription}
          onChange={(value) =>
            setContent({
              ...content,
              copy: { ...copy, longDescription: value },
            })
          }
          tall
        />
        <TextField
          label="Keywords"
          hint="Comma separated"
          value={copy.keywords.join(", ")}
          onChange={(value) =>
            setContent({
              ...content,
              copy: { ...copy, keywords: splitList(value) },
            })
          }
        />
        <TextArea
          label="Support text"
          value={copy.supportText}
          onChange={(value) =>
            setContent({ ...content, copy: { ...copy, supportText: value } })
          }
        />
        <TextArea
          label="Release notes"
          value={copy.releaseNotes}
          onChange={(value) =>
            setContent({ ...content, copy: { ...copy, releaseNotes: value } })
          }
        />
      </FieldGrid>
    </section>
  );
}

function AssetFields({
  content,
  setContent,
  assetById,
  openPicker,
}: {
  content: StorefrontContent;
  setContent: (content: StorefrontContent) => void;
  assetById: Map<string, Assets[number]>;
  openPicker: (target: PickerTarget) => void;
}) {
  const reorder = (
    key: "screenshots" | "promotionalAssets" | "videos",
    index: number,
    direction: -1 | 1,
  ) => {
    const next = [...content[key]];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    const ordered = next.map((item, order) => ({ ...item, order }));
    setContent({ ...content, [key]: ordered });
  };
  return (
    <section className="space-y-7">
      <AssetSection title="Icon" onAdd={() => openPicker("icon")}>
        {content.iconMediaAssetId ? (
          <AssetRow
            asset={assetById.get(content.iconMediaAssetId)}
            label="Storefront icon"
            onRemove={() => setContent({ ...content, iconMediaAssetId: null })}
          />
        ) : (
          <EmptyAsset />
        )}
      </AssetSection>
      <AssetSection
        title="Screenshots and curated views"
        onAdd={() => openPicker("screenshot")}
      >
        {content.screenshots.length === 0 ? (
          <EmptyAsset />
        ) : (
          content.screenshots.map((item, index) => (
            <AssetRow
              key={item.id}
              asset={assetById.get(item.mediaAssetId)}
              label={item.title || `Screenshot ${index + 1}`}
              onRemove={() =>
                setContent({
                  ...content,
                  screenshots: content.screenshots.filter(
                    (entry) => entry.id !== item.id,
                  ),
                })
              }
              onUp={() => reorder("screenshots", index, -1)}
              onDown={() => reorder("screenshots", index, 1)}
              extra={
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <select
                    value={item.presentation}
                    onChange={(event) =>
                      setContent({
                        ...content,
                        screenshots: content.screenshots.map((entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                presentation: event.target.value as
                                  | "product_ui"
                                  | "marketing_composite",
                              }
                            : entry,
                        ),
                      })
                    }
                    className="bg-background rounded border px-2 py-1 text-[10px]"
                  >
                    <option value="product_ui">Product UI</option>
                    <option value="marketing_composite">
                      Marketing composite
                    </option>
                  </select>
                  {(
                    [
                      ["title", "Frame title"],
                      ["caption", "Caption"],
                      ["altText", "Alt text"],
                      ["device", "Device / format"],
                    ] as const
                  ).map(([field, placeholder]) => (
                    <input
                      key={field}
                      value={item[field] ?? ""}
                      placeholder={placeholder}
                      onChange={(event) =>
                        setContent({
                          ...content,
                          screenshots: content.screenshots.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, [field]: event.target.value }
                              : entry,
                          ),
                        })
                      }
                      className="bg-background min-w-0 rounded border px-2 py-1 text-[10px]"
                    />
                  ))}
                </div>
              }
            />
          ))
        )}
      </AssetSection>
      <AssetSection
        title="Promotional assets"
        onAdd={() => openPicker("promotional")}
      >
        {content.promotionalAssets.length === 0 ? (
          <EmptyAsset />
        ) : (
          content.promotionalAssets.map((item, index) => (
            <AssetRow
              key={item.id}
              asset={assetById.get(item.mediaAssetId)}
              label={item.role}
              onRemove={() =>
                setContent({
                  ...content,
                  promotionalAssets: content.promotionalAssets.filter(
                    (entry) => entry.id !== item.id,
                  ),
                })
              }
              onUp={() => reorder("promotionalAssets", index, -1)}
              onDown={() => reorder("promotionalAssets", index, 1)}
              extra={
                <input
                  value={item.role}
                  onChange={(event) =>
                    setContent({
                      ...content,
                      promotionalAssets: content.promotionalAssets.map(
                        (entry) =>
                          entry.id === item.id
                            ? { ...entry, role: event.target.value }
                            : entry,
                      ),
                    })
                  }
                  className="bg-background mt-2 w-full rounded border px-2 py-1 text-[10px]"
                />
              }
            />
          ))
        )}
      </AssetSection>
      <AssetSection title="Videos" onAdd={() => openPicker("video")}>
        {content.videos.length === 0 ? (
          <EmptyAsset />
        ) : (
          content.videos.map((item, index) => (
            <AssetRow
              key={item.id}
              asset={assetById.get(item.mediaAssetId)}
              label={item.role}
              onRemove={() =>
                setContent({
                  ...content,
                  videos: content.videos.filter(
                    (entry) => entry.id !== item.id,
                  ),
                })
              }
              onUp={() => reorder("videos", index, -1)}
              onDown={() => reorder("videos", index, 1)}
              extra={
                <input
                  value={item.role}
                  onChange={(event) =>
                    setContent({
                      ...content,
                      videos: content.videos.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, role: event.target.value }
                          : entry,
                      ),
                    })
                  }
                  className="bg-background mt-2 w-full rounded border px-2 py-1 text-[10px]"
                />
              }
            />
          ))
        )}
      </AssetSection>
    </section>
  );
}

function AssetPicker({
  target,
  assets,
  onClose,
  onPick,
}: {
  target: PickerTarget;
  assets: Assets;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const visible = assets.filter((asset) =>
    target === "video" ? asset.kind === "video" : asset.kind === "image",
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background max-h-[80vh] w-full max-w-3xl overflow-auto rounded-2xl border p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Choose from Media Library</h2>
            <p className="text-muted-foreground text-xs">
              Ready assets owned by this product&apos;s brand.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border p-2">
            <X className="size-4" />
          </button>
        </div>
        {visible.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No compatible ready assets found.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {visible.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onPick(asset.id)}
                className="hover:border-foreground/30 overflow-hidden rounded-xl border text-left"
              >
                <div className="bg-muted aspect-square">
                  {asset.thumbnailUrl || asset.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.thumbnailUrl ?? asset.url ?? ""}
                      alt={asset.alt ?? asset.title ?? ""}
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="text-muted-foreground m-auto size-5" />
                  )}
                </div>
                <p className="truncate p-2 text-[10px]">
                  {asset.title ?? asset.alt ?? asset.id}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          onClick={onAdd}
          className="text-primary inline-flex items-center gap-1 text-xs"
        >
          <Plus className="size-3" /> Add from library
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AssetRow({
  asset,
  label,
  onRemove,
  onUp,
  onDown,
  extra,
}: {
  asset?: Assets[number];
  label: string;
  onRemove: () => void;
  onUp?: () => void;
  onDown?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-2">
      <div className="bg-muted size-14 shrink-0 overflow-hidden rounded-lg">
        {asset?.thumbnailUrl || asset?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnailUrl ?? asset.url ?? ""}
            alt={asset.alt ?? asset.title ?? ""}
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon className="text-muted-foreground m-5 size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{label}</p>
        <p className="text-muted-foreground truncate text-[10px]">
          {asset?.title ?? asset?.id ?? "Missing Media Library item"}
        </p>
        {extra}
      </div>
      {onUp && (
        <button onClick={onUp} className="rounded border p-1.5">
          <ArrowUp className="size-3" />
        </button>
      )}
      {onDown && (
        <button onClick={onDown} className="rounded border p-1.5">
          <ArrowDown className="size-3" />
        </button>
      )}
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive rounded border p-1.5"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function EmptyAsset() {
  return (
    <div className="text-muted-foreground rounded-xl border border-dashed p-5 text-center text-xs">
      Nothing selected.
    </div>
  );
}

function FieldGrid({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-background w-full rounded-lg border px-3 py-2"
      />
      {hint && (
        <span className="text-muted-foreground mt-1 block text-[10px]">
          {hint}
        </span>
      )}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  tall,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tall?: boolean;
}) {
  return (
    <label className={cn("text-xs", tall && "sm:col-span-2")}>
      <span className="mb-1 block font-medium">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "bg-background w-full rounded-lg border px-3 py-2",
          tall ? "min-h-44" : "min-h-24",
        )}
      />
    </label>
  );
}

function Freshness({ status }: { status: Storefront["freshnessStatus"] }) {
  const stale = status === "stale";
  const current = status === "up_to_date";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium",
        stale && "border-amber-500/30 bg-amber-500/10 text-amber-700",
        current && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
        !stale && !current && "text-muted-foreground",
      )}
    >
      {stale ? (
        <TriangleAlert className="size-3.5" />
      ) : (
        <CheckCircle2 className="size-3.5" />
      )}
      {status.replaceAll("_", " ")}
    </span>
  );
}

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
    >
      {label} <ExternalLink className="size-3" />
    </a>
  );
}

const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
