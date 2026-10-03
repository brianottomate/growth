import { describe, expect, test } from "bun:test";

import {
  mentionFromProfile,
  parsePlatformPostText,
  platformPostText,
  platformPostDocumentsEqual,
  readCurrentPlatformPostDocument,
  resolvePlatformPostMentions,
  serializePlatformPostDocument,
  writePlatformPostDocument,
} from "./platform-post-document";

describe("platform post documents", () => {
  test("round-trips paragraphs, hard breaks, and X mentions", () => {
    const source = "First line\nstill together\n\nThanks @wander";
    const document = parsePlatformPostText(source, "x");
    expect(serializePlatformPostDocument(document, "x")).toBe(source);
    expect(
      document.content?.[1]?.content?.some((node) => node.type === "mention"),
    ).toBe(true);
  });

  test("round-trips native LinkedIn mentions as atomic nodes", () => {
    const source =
      "Thanks @[Wander](urn:li:organization:123) for the collaboration.";
    const document = parsePlatformPostText(source, "linkedin");
    expect(document.content?.[0]?.content?.[1]).toEqual({
      type: "mention",
      attrs: {
        id: "urn:li:organization:123",
        label: "Wander",
        platform: "linkedin",
        nativeId: "urn:li:organization:123",
        kind: "organization",
      },
    });
    expect(serializePlatformPostDocument(document, "linkedin")).toBe(source);
  });

  test("does not parse email addresses or overlong X handles as mentions", () => {
    const source = "Email hi@example.com or thank @sixteen_chars___";
    const document = parsePlatformPostText(source, "x");
    expect(serializePlatformPostDocument(document, "x")).toBe(source);
    expect(
      document.content?.[0]?.content?.filter((node) => node.type === "mention"),
    ).toHaveLength(0);
  });

  test("normalizes X profile URLs and rejects invalid handles", () => {
    expect(
      mentionFromProfile({
        platform: "x",
        displayName: "Kristian",
        profile: "https://twitter.com/kristianeboe/status/123",
      }),
    ).toMatchObject({
      handle: "kristianeboe",
      profileUrl: "https://x.com/kristianeboe",
    });
    expect(() =>
      mentionFromProfile({
        platform: "x",
        displayName: "",
        profile: "@not-valid-handle",
      }),
    ).toThrow("Enter an X profile URL or @handle");
  });

  test("keeps LinkedIn profiles structured until provider resolution", async () => {
    const mention = mentionFromProfile({
      platform: "linkedin",
      displayName: "Wander",
      profile: "https://www.linkedin.com/company/wander-com",
    });
    const document = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "mention" as const, attrs: mention }],
        },
      ],
    };
    expect(serializePlatformPostDocument(document, "linkedin")).toBe("@Wander");

    const resolved = await resolvePlatformPostMentions(
      document,
      async (item) => ({
        ...item,
        id: "urn:li:organization:123",
        nativeId: "urn:li:organization:123",
      }),
    );
    expect(serializePlatformPostDocument(resolved, "linkedin")).toBe(
      "@[Wander](urn:li:organization:123)",
    );
  });

  test("accepts only LinkedIn profile and company URLs", () => {
    expect(() =>
      mentionFromProfile({
        platform: "linkedin",
        displayName: "Wander",
        profile: "https://notlinkedin.com/company/wander",
      }),
    ).toThrow("Paste a LinkedIn profile or company URL");
  });

  test("uses stored structure only while it matches the current text", () => {
    const document = parsePlatformPostText("Hello @wander", "x");
    const metadata = writePlatformPostDocument({ keep: true }, document);
    expect(
      readCurrentPlatformPostDocument({
        metadata,
        text: "Hello @wander",
        platform: "x",
      }),
    ).toEqual(document);
    expect(
      platformPostText({
        metadata,
        text: "The assistant replaced this copy",
        platform: "x",
      }),
    ).toBe("The assistant replaced this copy");
  });
});

test("canonical editor equality ignores framework attributes while retaining mention identity", () => {
  const original = parsePlatformPostText("hello", "linkedin");
  const decorated = { ...original, attrs: { class: null } };
  expect(platformPostDocumentsEqual(original, decorated)).toBe(true);
  const a = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "mention",
            attrs: {
              id: "one",
              label: "Same",
              platform: "linkedin",
              nativeId: "one",
            },
          },
        ],
      },
    ],
  };
  const b = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "mention",
            attrs: {
              id: "two",
              label: "Same",
              platform: "linkedin",
              nativeId: "two",
            },
          },
        ],
      },
    ],
  };
  expect(platformPostDocumentsEqual(a, b)).toBe(false);
});
test("empty LinkedIn slugs are rejected before provider resolution", () => {
  for (const profile of [
    "https://www.linkedin.com/in/",
    "https://www.linkedin.com/company/",
  ])
    expect(() =>
      mentionFromProfile({
        platform: "linkedin",
        displayName: "Name",
        profile,
      }),
    ).toThrow();
});
