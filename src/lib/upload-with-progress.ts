/**
 * PUT a file to a presigned URL, reporting progress.
 *
 * `fetch` cannot report upload progress — there is no readable stream for the
 * request body in browsers — so a 100 MB video showed an indeterminate spinner
 * for its whole upload and read as a hang. It was not: the first one anybody
 * tried finished in 38 seconds and was reported as broken. XMLHttpRequest is
 * the only API that exposes `upload.onprogress`, so it is worth the older
 * shape.
 */
export function putWithProgress(
  url: string,
  file: Blob,
  options: {
    contentType: string;
    /** Fractional progress, 0 to 1. Not called if the server hides the length. */
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
    /** Fail a stalled upload instead of blocking the composer forever. */
    timeoutMs?: number;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    request.timeout = options.timeoutMs ?? 10 * 60 * 1000;
    request.setRequestHeader("Content-Type", options.contentType);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      options.onProgress(Math.min(1, event.loaded / event.total));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(1);
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${request.status})`));
    };
    request.onerror = () =>
      reject(new Error("Upload failed — the connection dropped"));
    request.onabort = () => reject(new Error("Upload cancelled"));
    request.ontimeout = () => reject(new Error("Upload timed out"));

    options.signal?.addEventListener("abort", () => request.abort(), {
      once: true,
    });
    request.send(file);
  });
}
