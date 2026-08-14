import { describe, expect, test } from "bun:test";

import {
  pickRecipient,
  type PregenRecipient,
} from "@/server/services/pregen-hubspot-outreach.service";

const contact = (over: Partial<PregenRecipient>): PregenRecipient => ({
  firstName: null,
  lastName: null,
  jobTitle: null,
  email: "someone@example.com",
  hubspotContactId: null,
  ...over,
});

const barb = contact({
  firstName: "Barb",
  lastName: "Kubiak",
  jobTitle: "Manager",
  email: "barb@mauiwestside.com",
  hubspotContactId: "1",
});
const walt = contact({
  firstName: "Walt",
  lastName: "Kubiak",
  jobTitle: "Owner",
  email: "walt@mauiwestside.com",
  hubspotContactId: "2",
});
const mainline = contact({
  firstName: "Maui Westside Properties",
  lastName: "- Mainline",
  email: "info@mauiwestside.com",
  hubspotContactId: "3",
});

describe("pickRecipient", () => {
  // Barb and Walt are identical on name, role and address, so anything short of
  // reading the record leaves the choice to row order.
  test("prefers whoever the logged history actually names most", () => {
    const history =
      "Call with Walt Kubiak. Call with Walt Kubiak. Emailed Barb Kubiak.";
    expect(pickRecipient([barb, walt], undefined, "mauiwestside.com", history))
      .toMatchObject({ email: "walt@mauiwestside.com" });
  });

  // The shared inbox is copied on every thread, so mention-counting hands it
  // the win unless it is excluded outright.
  test("never picks a shared mailbox, however often it appears", () => {
    const history = [
      "Maui Westside Properties - Mainline",
      "Maui Westside Properties - Mainline",
      "Maui Westside Properties - Mainline",
      "Call with Walt Kubiak.",
    ].join(" ");
    expect(
      pickRecipient([mainline, walt], undefined, "mauiwestside.com", history),
    ).toMatchObject({ email: "walt@mauiwestside.com" });
  });

  test("an explicit request wins over the scoring", () => {
    expect(
      pickRecipient(
        [barb, walt],
        "barb@mauiwestside.com",
        "mauiwestside.com",
        "Call with Walt Kubiak.",
      ),
    ).toMatchObject({ email: "barb@mauiwestside.com" });
  });

  // Company-level copy is the correct output when there is nobody to write to,
  // rather than a guess that gets addressed as "you".
  test("returns null when no contact is linked to HubSpot", () => {
    const unlinked = contact({ firstName: "Sam", email: "sam@example.com" });
    expect(pickRecipient([unlinked], undefined, "example.com", "")).toBeNull();
  });
});
