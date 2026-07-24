import { describe, expect, test } from "bun:test";

import {
  buildDriveQuery,
  escapeDriveQueryValue,
  resizeDriveThumbnail,
  sortDriveFiles,
} from "./google-drive";

describe("drive query", () => {
  test("excludes trash and restricts to rehostable image types", () => {
    const q = buildDriveQuery({});
    expect(q).toContain("trashed = false");
    expect(q).toContain("mimeType = 'image/jpeg'");
    expect(q).not.toContain("vnd.google-apps.folder");
  });

  test("includes folders only when browsing", () => {
    expect(buildDriveQuery({ includeFolders: true })).toContain(
      "mimeType = 'application/vnd.google-apps.folder'",
    );
  });

  test("scopes to a parent folder and a name search", () => {
    const q = buildDriveQuery({ folderId: "abc123", search: "hero" });
    expect(q).toContain("'abc123' in parents");
    expect(q).toContain("name contains 'hero'");
  });

  test("escapes quotes so a crafted name cannot break out of the query", () => {
    expect(escapeDriveQueryValue("o'brien")).toBe("o\\'brien");
    const q = buildDriveQuery({ search: "' or name contains '" });
    expect(q).toContain("name contains '\\' or name contains \\''");
  });
});

describe("thumbnails", () => {
  test("swaps Drive's size suffix", () => {
    expect(resizeDriveThumbnail("https://lh3.example/x=s220", 640)).toBe(
      "https://lh3.example/x=s640",
    );
    expect(resizeDriveThumbnail("https://lh3.example/x=s220-c", 640)).toBe(
      "https://lh3.example/x=s640",
    );
  });

  test("leaves an unsized link alone", () => {
    expect(resizeDriveThumbnail("https://lh3.example/x", 640)).toBe(
      "https://lh3.example/x",
    );
  });
});

describe("ordering", () => {
  const file = (name: string) => ({ name, mimeType: "image/png" });

  test("sorts numerically the way a person reads a folder", () => {
    const sorted = sortDriveFiles([
      file("slide-10.png"),
      file("slide-2.png"),
      file("slide-1.png"),
    ]);
    expect(sorted.map((f) => f.name)).toEqual([
      "slide-1.png",
      "slide-2.png",
      "slide-10.png",
    ]);
  });

  test("puts folders ahead of files", () => {
    const sorted = sortDriveFiles([
      file("a-image.png"),
      { name: "z-folder", mimeType: "application/vnd.google-apps.folder" },
    ]);
    expect(sorted.map((f) => f.name)).toEqual(["z-folder", "a-image.png"]);
  });
});
