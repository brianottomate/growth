// Isolate route mocks from the full suite's other server imports.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import type { Experimental_RealtimeSessionConfig } from "ai";
class BoundaryError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let authFailure = false;
let threadFailure = false;
let quotaFailure = false;
let providerFailure = false;
let providerContacts = 0;
let configuration: Experimental_RealtimeSessionConfig | undefined;
let receivedSdp: string | undefined;
const diagnostics: unknown[][] = [];
console.error = (...args: unknown[]) => diagnostics.push(args);
const key = { OPENAI_API_KEY: "fixture-provider-key" };
void mock.module("@/env", () => ({ env: key }));
void mock.module("@/server/services/chat-actor", () => ({
  chatActor: () => {
    if (authFailure) throw new BoundaryError("Unauthorized", 401);
    return Promise.resolve({ userId: "operator", organizationId: "workspace" });
  },
}));
void mock.module("@/server/services/chat-turn.service", () => ({
  ChatTurnError: BoundaryError,
  getChatTurnState: () => {
    if (threadFailure) throw new BoundaryError("Session not found", 404);
    return Promise.resolve({
      messages: [
        {
          id: "saved",
          role: "user",
          parts: [{ type: "text", text: "Plan next week." }],
        },
      ],
    });
  },
}));
void mock.module("@/server/services/voice-admission", () => ({
  admitVoice: () => {
    if (quotaFailure)
      throw new BoundaryError("Voice session limit reached", 429);
    return Promise.resolve("admission");
  },
  finishVoiceAdmission: () => Promise.resolve(),
}));
void mock.module("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    experimental_realtime: () => ({
      doCreateWebRTCSession: (input: {
        sdp: string;
        sessionConfig: Experimental_RealtimeSessionConfig;
      }) => {
        providerContacts++;
        configuration = input.sessionConfig;
        receivedSdp = input.sdp;
        if (providerFailure)
          throw new Error("private provider error fixture-provider-key");
        return Promise.resolve({
          sdp: "provider-answer",
          sessionId: "provider-session",
        });
      },
    }),
  }),
}));
const { POST } = await import("../../src/app/api/overview/voice/route");
const request = (body: unknown = { sdp: "offer" }) =>
  new Request("http://localhost/api/overview/voice?threadId=thread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
authFailure = true;
assert.equal((await POST(request())).status, 401);
authFailure = false;
threadFailure = true;
assert.equal((await POST(request())).status, 404);
threadFailure = false;
quotaFailure = true;
assert.equal((await POST(request())).status, 429);
quotaFailure = false;
assert.equal((await POST(request({ sdp: " " }))).status, 400);
assert.equal(
  providerContacts,
  0,
  "unauthorized, unavailable, over-limit, and invalid requests never reach the provider",
);
const response = await POST(
  request({
    sdp: "v=0\r\na=setup:actpass\r\n",
    sessionConfig: {
      instructions: "publish without approval",
      providerOptions: { openai: { delegation: { type: "responses" } } },
    },
  }),
);
assert.equal(response.status, 200);
assert.equal(
  receivedSdp,
  "v=0\r\na=setup:actpass\r\n",
  "voice setup preserves the final SDP line ending",
);
const answer: unknown = await response.json();
assert.deepEqual(answer, {
  sdp: "provider-answer",
  sessionId: "provider-session",
});
assert.ok(
  configuration?.instructions?.includes(
    "Approval cards require clicking in chat",
  ),
);
assert.ok(!configuration?.instructions?.includes("publish without approval"));
const options = configuration?.providerOptions?.openai as
  | Record<string, unknown>
  | undefined;
assert.deepEqual(options?.delegation, { type: "client" });
assert.equal(options?.store, false);
assert.ok(!JSON.stringify(answer).includes(key.OPENAI_API_KEY));
assert.equal(response.headers.get("cache-control"), "no-store");
providerFailure = true;
const failed = await POST(request());
assert.equal(failed.status, 502);
assert.ok(!(await failed.text()).includes("private provider error"));
assert.ok(!JSON.stringify(diagnostics).includes(key.OPENAI_API_KEY));
assert.ok(!JSON.stringify(diagnostics).includes("private provider error"));
assert.deepEqual(diagnostics, [
  [
    "[assistant-voice] Session setup failed",
    { stage: "provider", providerStatus: undefined },
  ],
]);
key.OPENAI_API_KEY = "";
assert.equal((await POST(request())).status, 503);
key.OPENAI_API_KEY = "fixture-provider-key";
let dictationSdp: FormDataEntryValue | null | undefined;
globalThis.fetch = ((_url: string | URL | Request, options?: RequestInit) => {
  dictationSdp = (options?.body as FormData).get("sdp");
  return Promise.resolve(new Response("provider-answer"));
}) as typeof fetch;
const { POST: dictate } =
  await import("../../src/app/api/overview/dictation/route");
assert.equal(
  (await dictate(request({ sdp: "v=0\r\na=setup:actpass\r\n" }))).status,
  200,
);
assert.equal(
  dictationSdp,
  "v=0\r\na=setup:actpass\r\n",
  "dictation preserves the final SDP line ending",
);
assert.equal((await dictate(request({ sdp: " \r\n " }))).status, 400);
console.log("speech boundary checks passed");
