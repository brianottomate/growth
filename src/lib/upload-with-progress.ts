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
const DEFAULT_UPLOAD_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

export function putWithProgress(
  url: string,
  file: Blob,
  options: {
    contentType: string;
    /** Fractional progress, 0 to 1. Not called if the server hides the length. */
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
    /** Abort after this long without progress. Defaults to 10m; 0 disables. */
    timeoutMs?: number;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    request.setRequestHeader("Content-Type", options.contentType);

    const inactivityTimeoutMs =
      options.timeoutMs ?? DEFAULT_UPLOAD_INACTIVITY_TIMEOUT_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const clearInactivityTimeout = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutId = undefined;
    };
    const armInactivityTimeout = () => {
      clearInactivityTimeout();
      if (inactivityTimeoutMs <= 0) return;
      timeoutId = setTimeout(() => {
        timedOut = true;
        request.abort();
      }, inactivityTimeoutMs);
    };

    request.upload.onprogress = (event) => {
      armInactivityTimeout();
      if (!event.lengthComputable || !options.onProgress) return;
      options.onProgress(Math.min(1, event.loaded / event.total));
    };
    request.onload = () => {
      clearInactivityTimeout();
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(1);
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${request.status})`));
    };
    request.onerror = () => {
      clearInactivityTimeout();
      reject(new Error("Upload failed — the connection dropped"));
    };
    request.onabort = () => {
      clearInactivityTimeout();
      reject(new Error(timedOut ? "Upload timed out" : "Upload cancelled"));
    };

    options.signal?.addEventListener("abort", () => request.abort(), {
      once: true,
    });
    armInactivityTimeout();
    request.send(file);
  });
}
