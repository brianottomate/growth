import { expect, test } from "bun:test";
import { settingsFromIntake } from "./performance-settings.service";

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
