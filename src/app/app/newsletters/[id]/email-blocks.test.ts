import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { blockImage, imageSource, toBlocks } from "./email-blocks";
import { emailHeaderTemplateIdSchema } from "@/lib/email-header-compositions";

test("email image edits retain the original photo, template and exact copy across reopening", () => {
  const dom = new Window();
  const parser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
  const node = Object.getOwnPropertyDescriptor(globalThis, "Node");
  try {
    Object.defineProperty(globalThis, "DOMParser", {
      configurable: true,
      value: dom.DOMParser,
    });
    Object.defineProperty(globalThis, "Node", {
      configurable: true,
      value: dom.Node,
    });
    const card = {
      source: "https://brand.example/photo.jpg?width=1200&quality=90",
      templateId: "split-frame" as const,
      formatId: "banner" as const,
      eyebrow: "Fall & winter",
      title: 'A "quiet" weekend',
      detail: "A place to slow down.",
    };
    const html = imageSource(
      "https://brand.example/composition.png",
      "A cabin",
      true,
      card,
    );
    expect(blockImage(toBlocks(html)[0]!, true)).toEqual({
      src: "https://brand.example/composition.png",
      alt: "A cabin",
      card,
    });
    const plain = imageSource(card.source, "A cabin", true, {
      ...card,
      templateId: "photo-only",
    });
    expect(blockImage(toBlocks(plain)[0]!, true)?.card).toEqual({
      ...card,
      templateId: "photo-only",
    });
    const legacy = html.replace(' data-card-template="split-frame"', "");
    expect(blockImage(toBlocks(legacy)[0]!, true)?.card?.templateId).toBe(
      "email-header",
    );
    expect(emailHeaderTemplateIdSchema.safeParse("tier-badge").success).toBe(
      false,
    );
  } finally {
    if (parser) Object.defineProperty(globalThis, "DOMParser", parser);
    else Reflect.deleteProperty(globalThis, "DOMParser");
    if (node) Object.defineProperty(globalThis, "Node", node);
    else Reflect.deleteProperty(globalThis, "Node");
    void dom.happyDOM.close();
  }
});
