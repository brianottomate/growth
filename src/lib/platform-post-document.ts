import { z } from "zod";

const EDITOR_METADATA_KEY = "platformPostEditor";

export const platformMentionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  platform: z.string().min(1),
  handle: z.string().min(1).nullable().optional(),
  profileUrl: z.string().url().nullable().optional(),
  nativeId: z.string().min(1).nullable().optional(),
  kind: z.enum(["person", "organization"]).nullable().optional(),
});

export type PlatformMention = z.infer<typeof platformMentionSchema>;

const inlineNodeSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("hardBreak") }),
  z.object({ type: z.literal("mention"), attrs: platformMentionSchema }),
]);

const paragraphSchema = z.object({
  type: z.literal("paragraph"),
  content: z.array(inlineNodeSchema).optional(),
});

export const platformPostDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(paragraphSchema).optional(),
});

export type PlatformPostDocument = z.infer<typeof platformPostDocumentSchema>;
type InlineNode = z.infer<typeof inlineNodeSchema>;

const storedDocumentSchema = z.object({
  version: z.literal(1),
  document: platformPostDocumentSchema,
});

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stripAt = (value: string) =>
  value.trim().replace(/^@/, "").replace(/\/$/, "");

const profileRoots: Record<string, string> = {
  x: "https://x.com/",
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  threads: "https://www.threads.net/@",
  tiktok: "https://www.tiktok.com/@",
  youtube: "https://www.youtube.com/@",
};

const xHandlePattern = /^[A-Za-z0-9_]{1,15}$/;

function parseXHandle(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) {
    const handle = stripAt(candidate);
    return xHandlePattern.test(handle) ? handle : null;
  }

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    const handle = url.pathname.split("/").find(Boolean);
    return handle && xHandlePattern.test(handle) ? handle : null;
  } catch {
    return null;
  }
}

function profileHandle(platform: string, value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) return stripAt(candidate) || null;

  try {
    const url = new URL(candidate);
    const parts = url.pathname.split("/").filter(Boolean);
    if (platform === "linkedin") {
      const marker = parts.findIndex(
        (part) => part === "in" || part === "company",
      );
      return marker >= 0 ? (parts[marker + 1] ?? null) : null;
    }
    const firstPart = parts.find(Boolean);
    return firstPart ? stripAt(firstPart) : null;
  } catch {
    return null;
  }
}

export function mentionFromProfile(input: {
  platform: string;
  displayName: string;
  profile: string;
}): PlatformMention {
  const platform = input.platform.toLowerCase();
  const displayName = input.displayName.trim();
  const profile = input.profile.trim();

  if (platform === "x") {
    const handle = parseXHandle(profile);
    if (!handle) {
      throw new Error(
        "Enter an X profile URL or @handle using up to 15 letters, numbers, or underscores.",
      );
    }
    return {
      id: `x:${handle.toLowerCase()}`,
      label: displayName || handle,
      platform,
      handle,
      profileUrl: `${profileRoots.x}${handle}`,
      nativeId: null,
      kind: "person",
    };
  }

  const pastedUrl = /^https?:\/\//i.test(profile) ? profile : null;
  const handle = profileHandle(platform, profile);
  if (platform === "linkedin") {
    if (!displayName)
      throw new Error("Enter the exact name shown on LinkedIn.");
    if (!pastedUrl)
      throw new Error("Paste the full LinkedIn profile or company URL.");

    let url: URL;
    try {
      url = new URL(pastedUrl);
    } catch {
      throw new Error("Paste a LinkedIn profile or company URL.");
    }
    const host = url.hostname.toLowerCase();
    if (
      (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) ||
      !/^\/(in|company)\/[^/]+\/?$/.test(url.pathname)
    ) {
      throw new Error("Paste a LinkedIn profile or company URL.");
    }

    const canonicalUrl = `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
    return {
      id: `linkedin:${canonicalUrl.toLowerCase()}`,
      label: displayName,
      platform,
      handle,
      profileUrl: canonicalUrl,
      nativeId: null,
      kind: url.pathname.startsWith("/company/") ? "organization" : "person",
    };
  }

  if (!handle) throw new Error("Enter a profile URL or @handle.");
  return {
    id: `${platform}:${handle.toLowerCase()}`,
    label: displayName || handle,
    platform,
    handle,
    profileUrl:
      pastedUrl ??
      (profileRoots[platform] ? `${profileRoots[platform]}${handle}` : null),
    nativeId: null,
    kind: "person",
  };
}

function renderMention(mention: PlatformMention, platform: string): string {
  if (platform === "linkedin" && mention.nativeId?.startsWith("urn:li:")) {
    return `@[${mention.label}](${mention.nativeId})`;
  }
  if (platform === "linkedin") return `@${mention.label}`;
  return mention.handle ? `@${stripAt(mention.handle)}` : `@${mention.label}`;
}

function textNode(text: string): InlineNode[] {
  return text ? [{ type: "text", text }] : [];
}

function parseInline(text: string, platform: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const matcher =
    platform === "linkedin"
      ? /@\[([^\]]+)]\((urn:li:(person|organization):[^)]+)\)/g
      : platform === "x"
        ? /@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/g
        : /@([A-Za-z0-9_][A-Za-z0-9_.-]{0,49})/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text))) {
    if (
      platform !== "linkedin" &&
      match.index > 0 &&
      /[A-Za-z0-9._%+-]/.test(text[match.index - 1] ?? "")
    ) {
      continue;
    }
    nodes.push(...textNode(text.slice(cursor, match.index)));
    if (platform === "linkedin") {
      nodes.push({
        type: "mention",
        attrs: {
          id: match[2]!,
          label: match[1]!,
          platform,
          nativeId: match[2]!,
          kind: match[3] as "person" | "organization",
        },
      });
    } else {
      const handle = match[1]!;
      nodes.push({
        type: "mention",
        attrs: {
          id: `${platform}:${handle.toLowerCase()}`,
          label: handle,
          platform,
          handle,
          kind: "person",
        },
      });
    }
    cursor = match.index + match[0].length;
  }
  nodes.push(...textNode(text.slice(cursor)));
  return nodes;
}

function parseParagraph(text: string, platform: string) {
  const content: InlineNode[] = [];
  text.split("\n").forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    content.push(...parseInline(line, platform));
  });
  return {
    type: "paragraph" as const,
    ...(content.length ? { content } : {}),
  };
}

export function parsePlatformPostText(
  value: string | null | undefined,
  platform: string,
): PlatformPostDocument {
  const text = (value ?? "").replace(/\r\n?/g, "\n").trim();
  return {
    type: "doc",
    content: text.split("\n\n").map((part) => parseParagraph(part, platform)),
  };
}

export function serializePlatformPostDocument(
  document: PlatformPostDocument,
  platform: string,
): string {
  return (document.content ?? [])
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => {
          if (node.type === "text") return node.text;
          if (node.type === "hardBreak") return "\n";
          return renderMention(node.attrs, platform);
        })
        .join(""),
    )
    .join("\n\n")
    .trim();
}

export async function resolvePlatformPostMentions(
  document: PlatformPostDocument,
  resolve: (mention: PlatformMention) => Promise<PlatformMention>,
): Promise<PlatformPostDocument> {
  return {
    type: "doc",
    content: await Promise.all(
      (document.content ?? []).map(async (paragraph) => ({
        type: "paragraph" as const,
        ...(paragraph.content
          ? {
              content: await Promise.all(
                paragraph.content.map(async (node) =>
                  node.type === "mention"
                    ? {
                        type: "mention" as const,
                        attrs: platformMentionSchema.parse(
                          await resolve(node.attrs),
                        ),
                      }
                    : node,
                ),
              ),
            }
          : {}),
      })),
    ),
  };
}

export function readCurrentPlatformPostDocument(input: {
  metadata: unknown;
  text: string | null | undefined;
  platform: string;
}): PlatformPostDocument | null {
  const parsed = storedDocumentSchema.safeParse(
    asRecord(input.metadata)[EDITOR_METADATA_KEY],
  );
  if (!parsed.success) return null;
  return serializePlatformPostDocument(parsed.data.document, input.platform) ===
    (input.text ?? "").replace(/\r\n?/g, "\n").trim()
    ? parsed.data.document
    : null;
}

export function writePlatformPostDocument(
  metadata: unknown,
  document: PlatformPostDocument,
): Record<string, unknown> {
  return {
    ...asRecord(metadata),
    [EDITOR_METADATA_KEY]: { version: 1, document },
  };
}

export function platformPostText(input: {
  metadata: unknown;
  text: string | null | undefined;
  platform: string;
}): string {
  const document = readCurrentPlatformPostDocument(input);
  return document
    ? serializePlatformPostDocument(document, input.platform)
    : (input.text ?? "").replace(/\r\n?/g, "\n").trim();
}

/** Compare editor documents after removing editor-only attributes and filling defaults. */
export function platformPostDocumentsEqual(
  left: unknown,
  right: unknown,
): boolean {
  const canonical = (value: unknown) => {
    const parsed = platformPostDocumentSchema.safeParse(value);
    if (!parsed.success) return null;
    return JSON.stringify(
      (parsed.data.content ?? []).map((paragraph) =>
        (paragraph.content ?? []).map((node) =>
          node.type === "mention"
            ? {
                type: node.type,
                attrs: {
                  ...node.attrs,
                  handle: node.attrs.handle ?? null,
                  profileUrl: node.attrs.profileUrl ?? null,
                  nativeId: node.attrs.nativeId ?? null,
                  kind: node.attrs.kind ?? null,
                },
              }
            : node,
        ),
      ),
    );
  };
  const a = canonical(left);
  return a !== null && a === canonical(right);
}
