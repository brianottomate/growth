/**
 * Read `File`s out of a drop or a file-input change.
 *
 * react-dropzone's default reader (`file-selector`) prefers
 * `DataTransferItem.getAsFileSystemHandle()` for drops and then calls
 * `getFile()` on the handle. The platform refuses that for sources it will not
 * release — another application's sandbox, an un-materialized cloud file, a
 * location needing explicit permission — with
 *
 *   NotAllowedError: Failed to execute 'getFile' on 'FileSystemFileHandle'
 *
 * and `file-selector` throws rather than falling back, so a single unreadable
 * item fails the whole drop. Note this is unrelated to `useFsAccessApi`, which
 * only governs the click path.
 *
 * Nothing here wants a handle, only bytes, so read the plain `DataTransfer`
 * and walk directory entries directly. Folder drops keep working; the returned
 * files carry no `path` property, which no caller reads.
 */

type DropLike = {
  dataTransfer?: DataTransfer | null;
  target?: { files?: FileList | null } | null;
};

/** One entry, or every file beneath it when it is a directory. */
async function filesUnder(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) =>
      (entry as FileSystemFileEntry).file(
        (file) => resolve([file]),
        () => resolve([]),
      ),
    );
  }
  if (!entry.isDirectory) return [];

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const entries: FileSystemEntry[] = [];
  // readEntries yields at most 100 per call and signals the end with an empty
  // batch, so it has to be drained rather than read once.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) =>
      reader.readEntries(resolve, () => resolve([])),
    );
    if (batch.length === 0) break;
    entries.push(...batch);
  }
  const nested = await Promise.all(entries.map(filesUnder));
  return nested.flat();
}

export async function droppedFiles(event: unknown): Promise<File[]> {
  const source = event as DropLike | null;
  const transfer = source?.dataTransfer;
  if (!transfer) return Array.from(source?.target?.files ?? []);

  // A DataTransfer is neutered once the drop handler returns, so the item list
  // and its entries must both be taken before the first await.
  const entries = Array.from(transfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const flat = Array.from(transfer.files ?? []);

  if (!entries.some((entry) => entry.isDirectory)) return flat;
  const walked = (await Promise.all(entries.map(filesUnder))).flat();
  return walked.length > 0 ? walked : flat;
}
