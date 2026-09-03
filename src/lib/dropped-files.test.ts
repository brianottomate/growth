import { describe, expect, it } from "bun:test";

import { droppedFiles } from "./dropped-files";

/**
 * The contract this protects: a plain file drop must never depend on the
 * platform releasing a file handle. `file-selector` asked for one and threw
 * NotAllowedError for sources macOS refuses, which failed the entire drop
 * rather than the single item.
 */
const file = (name: string) => new File(["x"], name, { type: "video/mp4" });

function drop(input: {
  files: File[];
  entries?: (Partial<FileSystemEntry> | null)[];
}) {
  return {
    dataTransfer: {
      files: input.files,
      items: (input.entries ?? input.files.map(() => ({ isFile: true }))).map(
        (entry) => ({ webkitGetAsEntry: () => entry }),
      ),
    },
  };
}

describe("droppedFiles", () => {
  it("reads a flat drop straight off the DataTransfer", async () => {
    const files = [file("Build Concept_A.MP4"), file("Build Concept_B.MP4")];
    expect((await droppedFiles(drop({ files }))).map((f) => f.name)).toEqual([
      "Build Concept_A.MP4",
      "Build Concept_B.MP4",
    ]);
  });

  /**
   * Safari and Firefox expose no `webkitGetAsEntry`, and some sources return
   * null from it. Neither may cost us the files.
   */
  it("still returns the files when no entry is available", async () => {
    const files = [file("a.mp4")];
    expect(await droppedFiles(drop({ files, entries: [null] }))).toHaveLength(
      1,
    );
    expect(
      await droppedFiles({ dataTransfer: { files, items: [{}] } }),
    ).toHaveLength(1);
  });

  it("falls back to the flat list when a directory walk yields nothing", async () => {
    const files = [file("a.mp4")];
    const entries = [
      {
        isFile: false,
        isDirectory: true,
        createReader: () => ({
          readEntries: (resolve: (entries: FileSystemEntry[]) => void) =>
            resolve([]),
        }),
      },
    ];
    expect(await droppedFiles(drop({ files, entries }))).toHaveLength(1);
  });

  it("reads a file-input change event", async () => {
    const files = [file("a.mp4")];
    expect(await droppedFiles({ target: { files } })).toHaveLength(1);
  });

  it("returns nothing for an event carrying neither", async () => {
    expect(await droppedFiles({})).toEqual([]);
    expect(await droppedFiles(null)).toEqual([]);
  });
});
