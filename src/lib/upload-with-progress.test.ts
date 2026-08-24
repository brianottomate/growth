import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { putWithProgress } from "./upload-with-progress";

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest;

  upload = {
    onprogress: null as ((event: ProgressEvent) => void) | null,
  };
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  aborted = false;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open() {
    return undefined;
  }
  setRequestHeader() {
    return undefined;
  }
  send() {
    return undefined;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent);
  }
}

const originalXMLHttpRequest = globalThis.XMLHttpRequest;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const scheduledTimers = new Map<
  number,
  { callback: () => void; delay: number }
>();
let nextTimerId = 1;

function runNextTimer() {
  const entry = scheduledTimers.entries().next().value;
  if (!entry) throw new Error("Expected a pending timer");
  const [id, timer] = entry;
  scheduledTimers.delete(id);
  timer.callback();
}

beforeEach(() => {
  scheduledTimers.clear();
  nextTimerId = 1;
  globalThis.setTimeout = ((callback: () => void, delay?: number) => {
    const id = nextTimerId++;
    scheduledTimers.set(id, { callback, delay: delay ?? 0 });
    return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    scheduledTimers.delete(id);
  }) as unknown as typeof clearTimeout;
  globalThis.XMLHttpRequest =
    FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  globalThis.XMLHttpRequest = originalXMLHttpRequest;
});

describe("putWithProgress", () => {
  test("re-arms the inactivity timeout whenever bytes move", async () => {
    const upload = putWithProgress("https://uploads.example/file", new Blob(), {
      contentType: "video/mp4",
      timeoutMs: 1_000,
    });
    const rejection = upload.catch((error: unknown) => error);

    expect(scheduledTimers.size).toBe(1);
    expect([...scheduledTimers.values()][0]?.delay).toBe(1_000);
    FakeXMLHttpRequest.latest.emitProgress(1, 2);
    expect(scheduledTimers.size).toBe(1);
    runNextTimer();

    expect(await rejection).toEqual(new Error("Upload timed out"));
    expect(FakeXMLHttpRequest.latest.aborted).toBe(true);
  });

  test("distinguishes an operator cancellation from an idle timeout", async () => {
    const controller = new AbortController();
    const upload = putWithProgress("https://uploads.example/file", new Blob(), {
      contentType: "video/mp4",
      signal: controller.signal,
    });
    const rejection = upload.catch((error: unknown) => error);

    controller.abort();

    expect(await rejection).toEqual(new Error("Upload cancelled"));
    expect(scheduledTimers.size).toBe(0);
  });

  test("reports progress and clears the default timer after success", async () => {
    const onProgress = mock((_fraction: number) => undefined);
    const upload = putWithProgress("https://uploads.example/file", new Blob(), {
      contentType: "image/png",
      onProgress,
    });

    FakeXMLHttpRequest.latest.emitProgress(1, 2);
    FakeXMLHttpRequest.latest.status = 200;
    FakeXMLHttpRequest.latest.onload?.();
    await upload;

    expect(FakeXMLHttpRequest.latest.aborted).toBe(false);
    expect(scheduledTimers.size).toBe(0);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0.5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 1);
  });
});
