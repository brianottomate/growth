import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CopySuggestionsCard } from "../../src/app/app/overview/CopySuggestionsCard";

const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
const messages: string[] = [];
const output = {
  target: { surface: "ad", brandId: "brand-1", adId: "ad-2" },
  options: ["Together", "Slow mornings", "City base"].map((label) => ({
    label,
    rationale: "A supported angle",
    edits: [
      { kind: "ad", shape: null, body: `Caption: ${label}` },
      {
        kind: "composition",
        cardId: "slide-2",
        shape: "story",
        title: `Image: ${label}`,
      },
    ],
  })),
};
await act(async () => {
  root.render(
    <CopySuggestionsCard
      output={output}
      busy={false}
      onPrompt={(message) => messages.push(message)}
    />,
  );
});
assert.equal(
  messages.length,
  0,
  "Rendering suggestions must never apply anything",
);
assert.equal(host.querySelectorAll("button").length, 3);
assert.ok(host.textContent?.includes("Caption: Slow mornings"));
assert.ok(host.textContent?.includes("Image: Slow mornings"));
await act(async () => {
  host.querySelectorAll("button")[1]!.click();
});
assert.equal(messages.length, 1);
assert.deepEqual(JSON.parse(messages[0]!.split("\n\n")[1]!), {
  target: output.target,
  edits: output.options[1]!.edits,
});
await act(async () => {
  root.render(
    <CopySuggestionsCard
      output={output}
      busy={true}
      onPrompt={(message) => messages.push(message)}
    />,
  );
});
assert.ok(
  [...host.querySelectorAll("button")].every((button) => button.disabled),
);
await act(async () => {
  host.querySelectorAll("button")[0]!.click();
});
assert.equal(
  messages.length,
  1,
  "Running chat must not receive another selection",
);
await act(async () => {
  root.unmount();
});
await window.happyDOM.abort();
console.log("copy selection checks passed");
