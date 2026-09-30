"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  Home,
  Image as ImageIcon,
  List,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";

import {
  DIGEST_TEMPLATE_KEY,
  type DigestProperty,
  type DigestSection,
  type ListingsDigest,
} from "@/lib/listings-digest";
import { orpc } from "@/orpc/client";
import { BrandHomePicker } from "./BrandHomesCard";
import {
  blockImage,
  blockSummary,
  type EmailBlock,
  fromBlocks,
  imageSource,
  isHtmlBody,
  newHomesBlock,
  newTextBlock,
  renumberGroups,
  toBlocks,
} from "./email-blocks";
import type { PreviewPick } from "./EmailPreviewFrame";
import { HomeGroupEditor } from "./HomeGroupEditor";
import { RichBlockEditor } from "./RichBlockEditor";

export type BlockFields = {
  subject: string;
  preheader: string | null;
  bodyMarkdown: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  templateKey: string;
  digest: ListingsDigest | null | undefined;
};

const input =
  "bg-background border-input focus:ring-ring/30 w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2";

const KIND_ICON = {
  text: Type,
  heading: Type,
  list: List,
  image: ImageIcon,
  homes: Home,
  other: Type,
} as const;

/** How the preview marks a block: text by position, homes by group. */
function pickFor(block: EmailBlock, list: EmailBlock[]): PreviewPick {
  return block.kind === "homes"
    ? { group: block.group }
    : { block: list.findIndex((b) => b.id === block.id) };
}

const iconButton =
  "grid size-7 place-items-center rounded-lg hover:bg-accent disabled:opacity-30";

/**
 * The email as its blocks: subject, each piece of the body, each group of
 * home cards, the button. One block opens at a time and edits in place;
 * "New copy" rewrites just that block. Every change lands in the draft, which
 * Save revision keeps.
 */
export function EmailBlocksCard({
  platformPostId,
  brandId,
  campaign,
  canAddHomes,
  fields,
  select,
  onOpenChange,
  onChange,
}: {
  platformPostId: string;
  brandId: string;
  campaign: string;
  canAddHomes: boolean;
  fields: BlockFields;
  /** What was clicked in the preview; the nonce repeats a pick. */
  select: { pick: PreviewPick; nonce: number } | null;
  /** The open block, as the preview marks it. */
  onOpenChange: (pick: PreviewPick | null) => void;
  /** Apply a change to the draft and refresh the preview. */
  onChange: (next: Partial<BlockFields>) => void;
}) {
  const html = isHtmlBody(fields.bodyMarkdown) || !fields.bodyMarkdown.trim();
  // Read in the browser: parsing the body needs its DOMParser.
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  useEffect(() => {
    setBlocks(toBlocks(fields.bodyMarkdown));
    // The card remounts per revision; typing never re-reads the body.
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);
  const [open, setOpen] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");
  const [bufferVersion, setBufferVersion] = useState(0);
  const [source, setSource] = useState(false);
  const [imageBuffer, setImageBuffer] = useState({ src: "", alt: "" });
  const [instruction, setInstruction] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [head, setHead] = useState({
    subject: fields.subject,
    preheader: fields.preheader ?? "",
    ctaLabel: fields.ctaLabel ?? "",
    ctaUrl: fields.ctaUrl ?? "",
  });

  const rewrite = useMutation(orpc.newsletter.rewriteBlock.mutationOptions());
  const sections = fields.digest?.sections ?? [];

  const openBlock = (block: EmailBlock | null, list = blocks) => {
    setOpen(block?.id ?? null);
    onOpenChange(block ? pickFor(block, list) : null);
    if (!block) return;
    setBuffer(block.source);
    setBufferVersion((v) => v + 1);
    setSource(!html);
    setImageBuffer(blockImage(block, html) ?? { src: "", alt: "" });
    setInstruction("");
    rewrite.reset();
  };

  useEffect(() => {
    if (!select) return;
    const { pick } = select;
    const block =
      pick.block !== undefined
        ? blocks[pick.block]
        : blocks.find((b) => b.kind === "homes" && b.group === pick.group);
    if (block) openBlock(block);
    // oxlint-disable-next-line react/exhaustive-deps
  }, [select?.nonce]);

  const withDigest = (nextSections: DigestSection[]) => ({
    templateKey: nextSections.length ? DIGEST_TEMPLATE_KEY : "editorial",
    digest: nextSections.length
      ? {
          schema: "wander-growth.listings-digest.v1" as const,
          theme: fields.digest?.theme ?? null,
          rationale: fields.digest?.rationale ?? null,
          sections: nextSections,
        }
      : null,
  });
  const commit = (next: EmailBlock[], nextSections = sections) => {
    setBlocks(next);
    onChange({
      bodyMarkdown: fromBlocks(next, html),
      ...(nextSections === sections ? {} : withDigest(nextSections)),
    });
  };
  const setSection = (index: number, section: DigestSection) =>
    onChange(withDigest(sections.map((s, i) => (i === index ? section : s))));

  const done = (block: EmailBlock) => {
    const next =
      block.kind === "image"
        ? imageSource(imageBuffer.src, imageBuffer.alt, html)
        : buffer.trim();
    if (next && next !== block.source) {
      commit(
        blocks.map((b) => (b.id === block.id ? { ...b, source: next } : b)),
      );
    }
    openBlock(null);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...blocks];
    const [block] = next.splice(index, 1);
    next.splice(index + by, 0, block!);
    commit(next);
    onOpenChange(pickFor(block!, next));
  };
  const remove = (block: EmailBlock) => {
    if (block.kind === "homes" && block.group !== undefined) {
      // A group's spot goes with the group, and later groups move up one.
      const rest = renumberGroups(
        blocks.filter((b) => b.id !== block.id),
        block.group,
      );
      commit(
        rest,
        sections.filter((_, i) => i !== block.group),
      );
    } else {
      commit(blocks.filter((b) => b.id !== block.id));
    }
    openBlock(null);
  };
  const addGroup = (homes: DigestProperty[]) => {
    const group = sections.length;
    commit(
      [...blocks, newHomesBlock(group)],
      [...sections, { heading: "", layout: null, properties: homes }],
    );
    setAddingGroup(false);
  };
  const placeGroup = (group: number) =>
    commit([...blocks, newHomesBlock(group)]);
  const applyHead = () =>
    onChange({
      subject: head.subject,
      preheader: head.preheader || null,
      ctaLabel: head.ctaLabel || null,
      ctaUrl: head.ctaUrl || null,
    });

  const placed = new Set(
    blocks.flatMap((block) =>
      block.kind === "homes" && block.group !== undefined ? [block.group] : [],
    ),
  );
  const unplaced = sections.flatMap((section, index) =>
    placed.has(index) ? [] : [{ section, index }],
  );

  const groupLabel = (group: number | undefined) => {
    const section = group === undefined ? undefined : sections[group];
    if (!section) return "Home cards (no homes yet)";
    const count = section.properties.length;
    return `${section.heading || "Home cards"} · ${count} ${count === 1 ? "home" : "homes"}${section.layout ? ` · ${section.layout}` : ""}`;
  };

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Email</h2>

      <div className="grid grid-cols-1 gap-2">
        <input
          value={head.subject}
          onChange={(event) =>
            setHead({ ...head, subject: event.target.value })
          }
          onBlur={applyHead}
          aria-label="Subject"
          placeholder="Subject"
          className={`${input} font-medium`}
        />
        <input
          value={head.preheader}
          onChange={(event) =>
            setHead({ ...head, preheader: event.target.value })
          }
          onBlur={applyHead}
          aria-label="Preheader"
          placeholder="Preheader"
          className={input}
        />
      </div>

      <ol className="mt-3 space-y-1.5">
        {blocks.map((block, index) => {
          const Icon = KIND_ICON[block.kind];
          const image = blockImage(block, html);
          const section =
            block.kind === "homes" && block.group !== undefined
              ? sections[block.group]
              : undefined;
          if (open !== block.id) {
            return (
              <li key={block.id}>
                <button
                  type="button"
                  onClick={() => openBlock(block)}
                  className="flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left hover:bg-accent/40"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  {image?.src ? (
                    // oxlint-disable-next-line nextjs/no-img-element
                    <img
                      src={image.src}
                      alt={image.alt}
                      className="h-12 w-20 rounded object-cover"
                    />
                  ) : block.kind === "homes" ? (
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      {section?.properties.slice(0, 4).map((home) =>
                        home.imageUrl ? (
                          // oxlint-disable-next-line nextjs/no-img-element
                          <img
                            key={home.homeId ?? home.name}
                            src={home.imageUrl}
                            alt=""
                            className="size-8 rounded object-cover"
                          />
                        ) : null,
                      )}
                      <span className="truncate">
                        {groupLabel(block.group)}
                      </span>
                    </span>
                  ) : (
                    <span
                      className={`line-clamp-2 text-xs ${
                        block.kind === "heading" ? "font-semibold" : ""
                      }`}
                    >
                      {blockSummary(block, html) || "Empty"}
                    </span>
                  )}
                </button>
              </li>
            );
          }
          return (
            <li
              key={block.id}
              className="rounded-lg border border-primary p-2.5"
            >
              {block.kind === "image" ? (
                <div className="grid grid-cols-1 gap-2">
                  {imageBuffer.src && (
                    // oxlint-disable-next-line nextjs/no-img-element
                    <img
                      src={imageBuffer.src}
                      alt={imageBuffer.alt}
                      className="max-h-40 w-full rounded object-cover"
                    />
                  )}
                  <input
                    value={imageBuffer.src}
                    onChange={(event) =>
                      setImageBuffer({
                        ...imageBuffer,
                        src: event.target.value,
                      })
                    }
                    aria-label="Image URL"
                    placeholder="Image URL"
                    className={input}
                  />
                  <input
                    value={imageBuffer.alt}
                    onChange={(event) =>
                      setImageBuffer({
                        ...imageBuffer,
                        alt: event.target.value,
                      })
                    }
                    aria-label="Alt text"
                    placeholder="Alt text"
                    className={input}
                  />
                </div>
              ) : block.kind === "homes" ? (
                section ? (
                  <HomeGroupEditor
                    key={block.group}
                    section={section}
                    brandId={brandId}
                    campaign={campaign}
                    canAddHomes={canAddHomes}
                    onChange={(next) => setSection(block.group!, next)}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No homes in this group.
                  </p>
                )
              ) : (
                <>
                  {source ? (
                    <textarea
                      value={buffer}
                      onChange={(event) => setBuffer(event.target.value)}
                      aria-label="Block source"
                      rows={Math.min(12, Math.max(3, buffer.length / 70))}
                      className={`${input} font-mono text-xs`}
                    />
                  ) : (
                    <RichBlockEditor
                      key={bufferVersion}
                      html={buffer}
                      onChange={setBuffer}
                    />
                  )}
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      placeholder="Shorter, warmer, lead with the offer…"
                      aria-label="What to change"
                      className={`${input} text-xs`}
                    />
                    <button
                      type="button"
                      disabled={rewrite.isPending}
                      onClick={() =>
                        rewrite.mutate(
                          {
                            platformPostId,
                            block: buffer,
                            format: html ? "html" : "markdown",
                            instruction: instruction || undefined,
                            subject: head.subject,
                            bodyMarkdown: fields.bodyMarkdown,
                          },
                          {
                            onSuccess: ({ block: next }) => {
                              setBuffer(next);
                              setBufferVersion((v) => v + 1);
                            },
                          },
                        )
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                    >
                      {rewrite.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      New copy
                    </button>
                  </div>
                  {rewrite.error && (
                    <p className="mt-1 text-xs text-destructive">
                      {rewrite.error.message}
                    </p>
                  )}
                </>
              )}
              <div className="mt-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => done(block)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                >
                  <Check className="size-3.5" /> Done
                </button>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className={iconButton}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                  className={iconButton}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                {html &&
                  ["text", "heading", "list", "other"].includes(block.kind) && (
                    <button
                      type="button"
                      aria-label={source ? "Edit as text" : "Edit source"}
                      title={source ? "Edit as text" : "Edit source"}
                      onClick={() => {
                        setSource(!source);
                        setBufferVersion((v) => v + 1);
                      }}
                      className={`${iconButton} ${source ? "bg-accent" : ""}`}
                    >
                      <Code2 className="size-3.5" />
                    </button>
                  )}
                <button
                  type="button"
                  aria-label="Delete block"
                  onClick={() => remove(block)}
                  className={`${iconButton} ml-auto text-muted-foreground hover:text-destructive`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            const block = newTextBlock(html);
            const next = [...blocks, block];
            commit(next);
            openBlock(block, next);
          }}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          <Plus className="size-3.5" /> Paragraph
        </button>
        {canAddHomes && (
          <button
            type="button"
            onClick={() => setAddingGroup(!addingGroup)}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            <Plus className="size-3.5" /> Home cards
          </button>
        )}
      </div>
      {addingGroup && (
        <div className="mt-2 rounded-lg border p-2.5">
          <BrandHomePicker
            brandId={brandId}
            campaign={campaign}
            onAdd={addGroup}
          />
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 @md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <input
          value={head.ctaLabel}
          onChange={(event) =>
            setHead({ ...head, ctaLabel: event.target.value })
          }
          onBlur={applyHead}
          aria-label="Button label"
          placeholder="Button label"
          className={input}
        />
        <input
          value={head.ctaUrl}
          onChange={(event) => setHead({ ...head, ctaUrl: event.target.value })}
          onBlur={applyHead}
          aria-label="Button link"
          placeholder="Button link"
          className={input}
        />
      </div>

      {unplaced.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            After the button
          </h3>
          {unplaced.map(({ section, index }) => (
            <div key={index} className="rounded-lg border p-2.5">
              <HomeGroupEditor
                section={section}
                brandId={brandId}
                campaign={campaign}
                canAddHomes={canAddHomes}
                onChange={(next) => setSection(index, next)}
              />
              <button
                type="button"
                onClick={() => placeGroup(index)}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
              >
                <ArrowUp className="size-3.5" /> Move into the copy
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
