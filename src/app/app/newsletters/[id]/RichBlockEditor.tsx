"use client";

import {
  EditorContent,
  mergeAttributes,
  Node,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import { fieldHtml } from "./email-field-html";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, UserRound } from "lucide-react";

import { EMAIL_FIELDS, type EmailField } from "@/lib/email-personalization";

/**
 * A per-guest field as a chip, so `{{first_name|there}}` can't be mistyped.
 * It is the token in the body; the chip exists only while editing.
 */
const FieldChip = Node.create({
  name: "field",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      name: { default: "first_name" },
      fallback: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-field]",
        getAttrs: (element) => ({
          name: element.getAttribute("data-field"),
          fallback: element.getAttribute("data-fallback") ?? "",
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    // Tiptap types node attributes loosely; these are the two this node has.
    const { name, fallback } = node.attrs as { name: string; fallback: string };
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-field": name,
        "data-fallback": fallback,
        class:
          "rounded bg-primary/10 px-1 py-0.5 font-medium text-primary text-[0.9em]",
      }),
      fallback ? `${name} · ${fallback}` : name,
    ];
  },
});

const DEFAULT_FALLBACK: Record<EmailField, string> = {
  first_name: "there",
  last_home: "",
};

const tool =
  "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground data-[on=true]:bg-accent data-[on=true]:text-foreground";

/**
 * One block's words as they read, with bold, italic, links and per-guest
 * fields. Emits the block's HTML on every change.
 */
export function RichBlockEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: false },
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      FieldChip,
    ],
    content: typeof DOMParser === "undefined" ? "" : fieldHtml(html, "chips"),
    editorProps: {
      attributes: {
        class:
          "min-h-16 rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/30 [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_h2]:text-base [&_h2]:font-semibold [&_p+p]:mt-2",
      },
    },
    onUpdate: ({ editor }) => onChange(fieldHtml(editor.getHTML(), "tokens")),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold"),
      italic: current?.isActive("italic"),
      link: current?.isActive("link"),
    }),
  });
  if (!editor) return null;

  const setLink = () => {
    const current = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link", current ?? "https://");
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href.trim()) chain.setLink({ href: href.trim() }).run();
    else chain.unsetLink().run();
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Bold"
          data-on={active?.bold}
          aria-pressed={active?.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={tool}
        >
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          data-on={active?.italic}
          aria-pressed={active?.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={tool}
        >
          <Italic className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Link"
          data-on={active?.link}
          aria-pressed={active?.link}
          onClick={setLink}
          className={tool}
        >
          <Link2 className="size-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        {(Object.keys(EMAIL_FIELDS) as EmailField[]).map((name) => (
          <button
            key={name}
            type="button"
            title={EMAIL_FIELDS[name]}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "field",
                  attrs: { name, fallback: DEFAULT_FALLBACK[name] },
                })
                .run()
            }
            className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <UserRound className="size-3" />
            {name}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
