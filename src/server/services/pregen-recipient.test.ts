import { describe, expect, test } from "bun:test";

import {
  pickRecipient,
  type PregenRecipient,
} from "@/server/services/pregen-hubspot-outreach.service";

const contact = (over: Partial<PregenRecipient>): PregenRecipient => ({
  id: over.email ?? "ctc_1",
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
    expect(
      pickRecipient([barb, walt], undefined, "mauiwestside.com", history),
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
    const unlinked = contact({ firstName: "Sam", email: "sam@notreal.com" });
    expect(pickRecipient([unlinked], undefined, "notreal.com", "")).toBeNull();
  });

  // The shared inbox is copied on every thread, so it outranks people on
  // correspondence and is the wrong thing to address by name about a call.
  test("skips a role inbox however often the history names it", () => {
    const history = Array(6)
      .fill("Maui Westside Properties - Mainline")
      .concat("Call with Walt Kubiak.")
      .join(" ");
    expect(
      pickRecipient([mainline, walt], undefined, "mauiwestside.com", history),
    ).toMatchObject({ email: "walt@mauiwestside.com" });
  });
});
