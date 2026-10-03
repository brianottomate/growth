"use client";

import { useEffect, useState } from "react";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Mention from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import { AtSign, Plus, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  mentionFromProfile,
  platformPostDocumentsEqual,
  platformPostDocumentSchema,
  serializePlatformPostDocument,
  type PlatformMention,
  type PlatformPostDocument,
} from "@/lib/platform-post-document";

const SocialMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      platform: { default: null },
      handle: { default: null },
      profileUrl: { default: null },
      nativeId: { default: null },
      kind: { default: null },
    };
  },
}).configure({
  suggestions: [],
  HTMLAttributes: { class: "social-mention" },
  renderText({ node }) {
    return `@${String(node.attrs.label ?? node.attrs.id)}`;
  },
  renderHTML({ node, options }) {
    const label = String(node.attrs.label ?? node.attrs.id);
    const profileUrl =
      typeof node.attrs.profileUrl === "string" ? node.attrs.profileUrl : null;
    const pendingLinkedIn =
      node.attrs.platform === "linkedin" && !node.attrs.nativeId;
    return [
      profileUrl ? "a" : "span",
      {
        ...options.HTMLAttributes,
        class: `social-mention ${pendingLinkedIn ? "social-mention-pending" : "social-mention-ready"}`,
        "data-resolution": pendingLinkedIn ? "pending" : "ready",
        ...(profileUrl
          ? {
              href: profileUrl,
              target: "_blank",
              rel: "noopener noreferrer",
              title: `Open ${label}'s profile`,
            }
          : { title: `Mention ${label}` }),
      },
      `@${label}`,
    ];
  },
});

export function PlatformPostEditor({
  document,
  platform,
  placeholder,
  onChange,
}: {
  document: PlatformPostDocument;
  platform: string;
  placeholder: string;
  onChange: (document: PlatformPostDocument, text: string) => void;
}) {
  const [mentionFormOpen, setMentionFormOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState("");
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({ placeholder }),
      SocialMention,
    ],
    content: document,
    editorProps: {
      attributes: {
        class:
          "min-h-[10rem] whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed outline-none",
        "aria-label": "Platform-ready copy",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const parsed = platformPostDocumentSchema.safeParse(
        currentEditor.getJSON(),
      );
      if (!parsed.success) return;
      onChange(
        parsed.data,
        serializePlatformPostDocument(parsed.data, platform),
      );
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (!platformPostDocumentsEqual(editor.getJSON(), document)) {
      editor.commands.setContent(document);
    }
  }, [document, editor]);

  const insertMention = (mention: PlatformMention) => {
    editor
      ?.chain()
      .focus()
      .insertContent({ type: "mention", attrs: mention })
      .insertContent(" ")
      .run();
    setDisplayName("");
    setProfile("");
    setError(null);
    setMentionFormOpen(false);
  };

  const submitMention = () => {
    try {
      insertMention(mentionFromProfile({ platform, displayName, profile }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add mention",
      );
    }
  };

  return (
    <div className="mt-3">
      <div className="platform-post-editor overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-ring/40">
        <EditorContent editor={editor} />
        <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">
            {platform === "linkedin"
              ? "LinkedIn mentions resolve from a profile URL when the post is sent."
              : platform === "x"
                ? "Add an exact X profile URL or @handle."
                : "Add a profile URL or @handle."}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setMentionFormOpen((current) => !current);
              setError(null);
            }}
          >
            {mentionFormOpen ? (
              <X className="size-3.5" />
            ) : (
              <AtSign className="size-3.5" />
            )}
            {mentionFormOpen ? "Close" : "Add mention"}
          </Button>
        </div>
      </div>

      {mentionFormOpen && (
        <div className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={
                platform === "linkedin"
                  ? "Exact LinkedIn display name"
                  : "Display name (optional)"
              }
            />
            <Input
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
              placeholder={
                platform === "linkedin"
                  ? "Paste LinkedIn profile URL"
                  : platform === "x"
                    ? "Paste X profile URL or @handle"
                    : "Paste profile URL or @handle"
              }
            />
          </div>
          {error && (
            <p className="flex items-start gap-2 text-xs text-amber-300">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={!profile.trim()}
              onClick={submitMention}
            >
              <Plus className="size-3.5" />
              Add mention
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
