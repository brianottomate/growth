import { expect, test } from "bun:test";
import {
  settingsFromIntake,
  setPerformanceSettings,
} from "./performance-settings.service";
import type { Database } from "@/server/db";
import type { PerformanceSettings } from "@/server/db/brand-schema";

test("intake prose stays on the receipt instead of becoming an asset URL", () => {
  const settings = settingsFromIntake({
    creativeDriveUrl: "I have not set this up yet",
    guestListDriveUrl: "https://drive.google.com/folder/123",
    reportEmails: " reports@brand.com ",
  });
  expect(settings.creativeDriveUrl).toBeUndefined();
  expect(settings.guestListDriveUrl).toBe(
    "https://drive.google.com/folder/123",
  );
  expect(settings.reportEmails).toBe("reports@brand.com");
  expect(
    settingsFromIntake({ creativeDriveUrl: "javascript:alert(1)" })
      .creativeDriveUrl,
  ).toBeUndefined();
});

// The DB boundary returns the actual current settings; assertions protect
// partial operator updates, rather than query implementation details.
function settingsClient(settings: PerformanceSettings, conflict = false) {
  let written: PerformanceSettings | undefined;
  const client = {
    query: {
      brandTable: {
        findFirst: async () => ({
          id: "client",
          performanceSettings: settings,
        }),
      },
      userTable: {
        findFirst: async () => ({
          id: "operator",
          name: "Brooke",
          email: "brooke@example.com",
          image: "https://example.com/avatar.png",
        }),
      },
    },
    update: () => ({
      set: ({
        performanceSettings,
      }: {
        performanceSettings: PerformanceSettings;
      }) => ({
        where: () => ({
          returning: async () => {
            if (conflict) return [];
            written = performanceSettings;
            return [{ id: "client" }];
          },
        }),
      }),
    }),
  } as unknown as Database;
  return { client, written: () => written };
}

test("a chat update to catalog keeps the recorded platform, payment, and journey", async () => {
  const stored = {
    pipelineStage: "onboarding",
    monthlyFee: 2666.67,
    cardState: { catalog: "Approved", meta: "Live", managementPayment: "Paid" },
  } as const;
  const boundary = settingsClient(stored);
  const result = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: null,
    from: "agent",
    client: boundary.client,
    patch: { cardState: { catalog: "In production" } },
  });
  expect(result.settings.cardState).toEqual({
    ...stored.cardState,
    catalog: "In production",
  });
  expect(result.settings.pipelineStage).toBe("onboarding");
  expect(result.settings.monthlyFee).toBe(2666.67);
  expect(result.changed).toEqual(["cardState"]);
  expect(boundary.written()?.cardState?.managementPayment).toBe("Paid");
});

test("an explicit null clears only the selected readiness fact", async () => {
  const boundary = settingsClient({
    cardState: { site: "Live", emailDns: "Verified" },
  });
  const result = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: null,
    from: "agent",
    client: boundary.client,
    patch: { cardState: { emailDns: null } },
  });
  expect(result.settings.cardState).toEqual({ site: "Live", emailDns: null });
});

test("a concurrent settings edit fails rather than silently overwriting it", async () => {
  const boundary = settingsClient({ cardState: { meta: "Live" } }, true);
  const error = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: null,
    from: "agent",
    client: boundary.client,
    patch: { cardState: { meta: "Paused" } },
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("changed while saving");
  expect(boundary.written()).toBeUndefined();
});

test("note edits record the authenticated editor without changing delivery", async () => {
  const boundary = settingsClient({ cardState: { meta: "Paused" } });
  const result = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: "operator",
    from: "agent",
    client: boundary.client,
    patch: { note: "  Waiting on client feedback.  " },
  });
  expect(result.settings.note).toBe("Waiting on client feedback.");
  expect(result.settings.noteEditedBy).toEqual({
    id: "operator",
    name: "Brooke",
    image: "https://example.com/avatar.png",
  });
  expect(result.settings.noteEditedAt).toBe(result.settings.updatedAt);
  expect(result.settings.cardState?.meta).toBe("Paused");
});

test("unrelated changes preserve the note editor and blank notes clear", async () => {
  const existing = {
    note: "Awaiting approval",
    noteEditedAt: "2026-10-01T00:00:00.000Z",
    noteEditedBy: { id: "original", name: "Mikayla", image: null },
    cardState: { meta: "Paused" as const },
  };
  const boundary = settingsClient(existing);
  const updated = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: "operator",
    from: "agent",
    client: boundary.client,
    patch: { cardState: { meta: "Live" } },
  });
  expect(updated.settings.noteEditedBy).toEqual(existing.noteEditedBy);
  expect(updated.settings.noteEditedAt).toBe(existing.noteEditedAt);
  const cleared = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: "operator",
    from: "agent",
    client: settingsClient(existing).client,
    patch: { note: "   " },
  });
  expect(cleared.settings.note).toBeNull();
});
