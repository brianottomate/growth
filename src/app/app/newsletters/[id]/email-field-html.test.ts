import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { fieldHtml } from "./email-field-html";
import { unknownFields } from "@/lib/email-personalization";

test("field editing preserves escaped fallbacks, URLs and unknown tokens", () => {
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
    const source =
      '<p>{{first_name|Tom &amp; Jo &quot;team&quot;}} <a href="https://example.com/{{first_name}}">Website</a> {{unknown}}</p>';
    const first = fieldHtml(fieldHtml(source, "chips"), "tokens");
    expect(fieldHtml(fieldHtml(first, "chips"), "tokens")).toBe(first);
    expect(first).toContain('Tom &amp; Jo "team"');
    expect(first).toContain('href="https://example.com/{{first_name}}"');
    expect(first).toContain("{{unknown}}");
    expect(unknownFields("{{constructor}}")).toEqual(["constructor"]);
  } finally {
    if (parser) Object.defineProperty(globalThis, "DOMParser", parser);
    else Reflect.deleteProperty(globalThis, "DOMParser");
    if (node) Object.defineProperty(globalThis, "Node", node);
    else Reflect.deleteProperty(globalThis, "Node");
    void dom.happyDOM.close();
  }
});
