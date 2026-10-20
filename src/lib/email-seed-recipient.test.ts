import { expect, test } from "bun:test";
import { isBroadcastSeedRecipient } from "./email-seed-recipient";

test("prepared broadcast seeds are server-locked to approved inboxes", () => {
  expect(isBroadcastSeedRecipient(" thisisbriansun@gmail.com ")).toBe(true);
  expect(isBroadcastSeedRecipient("guest@example.com")).toBe(false);
});
