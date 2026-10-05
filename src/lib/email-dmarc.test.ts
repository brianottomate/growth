import { expect, test } from "bun:test";
import { emailDmarcStatus, optionalDmarcRecords } from "./email-dmarc";
const absent = {
  records: [],
};
test("existing inherited protection is preserved even when a starter is requested", () => {
  const status = emailDmarcStatus("wander.com", "post.wander.com", absent, {
    records: ["v=DMARC1; p=quarantine; rua=mailto:noreply@wander.com"],
  });
  expect(status).toMatchObject({
    state: "found",
    inherited: true,
    policy: "quarantine",
    hostname: "_dmarc.wander.com",
  });
  expect(optionalDmarcRecords(status, true)).toEqual([]);
});
test("failed lookups and ambiguous or malformed policies never authorize a replacement", () => {
  for (const direct of [
    {
      unavailable: true,
    } as const,
    {
      records: ["v=DMARC1; p=reject", "v=DMARC1; p=none"],
    },
    {
      records: ["v=DMARC1; p=bad"],
    },
    {
      records: ["p=reject; v=DMARC1"],
    },
    {
      records: ["v=DMARC1 p=reject"],
    },
    {
      records: ["unrecognized existing TXT record"],
    },
    {
      records: ["v=DMARC1; p=reject; p=none"],
    },
    {
      records: ["v=DMARC1; p=reject; aspf=bad"],
    },
  ]) {
    const status = emailDmarcStatus(
      "wander.com",
      "post.wander.com",
      direct,
      absent,
    );
    expect(["invalid", "unavailable"]).toContain(status.state);
    expect(optionalDmarcRecords(status, true)).toEqual([]);
  }
  expect(
    optionalDmarcRecords(
      emailDmarcStatus("wander.com", "post.wander.com", absent, {
        unavailable: true,
      }),
      true,
    ),
  ).toEqual([]);
});
