import { describe, expect, test } from "bun:test";

import {
  firstCommentDraftPatch,
  firstCommentLimit,
  firstCommentStatusLabel,
} from "./first-comment";

describe("first comments", () => {
  test("caption edits preserve queued and posted first-comment receipts", () => {
    for (const status of ["queued", "posted"]) {
      const current = {
        firstCommentText: "Existing comment",
        firstCommentStatus: status,
        firstCommentError: "Provider note",
        deliveryExternalId: "receipt1",
      };
      expect({
        ...current,
        ...firstCommentDraftPatch(
          current.firstCommentText,
          " Existing comment ",
          new Date(),
        ),
      }).toEqual(current);
    }
    expect(firstCommentDraftPatch("Old", "New", new Date(0))).toMatchObject({
      firstCommentText: "New",
      firstCommentStatus: "draft",
    });
    expect(firstCommentDraftPatch("Old", "", new Date())).toMatchObject({
      firstCommentText: null,
      firstCommentStatus: null,
    });
  });
  test("allows supported feed posts and excludes stories", () => {
    expect(firstCommentLimit("instagram", "instagram.image")).toBe(2_200);
    expect(firstCommentLimit("linkedin", "linkedin.text")).toBe(1_250);
    expect(firstCommentLimit("instagram", "instagram.story")).toBeNull();
    expect(firstCommentLimit("x", "x.post")).toBeNull();
  });

  test("labels receipt states for the content card", () => {
    expect(firstCommentStatusLabel("queued")).toBe("Queued");
    expect(firstCommentStatusLabel("posted")).toBe("Posted");
    expect(firstCommentStatusLabel("failed")).toBe("Failed");
    expect(firstCommentStatusLabel(null)).toBe("Draft");
  });
});
