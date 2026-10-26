import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EmailDnsConnection } from "./EmailDnsConnection";

describe("EmailDnsConnection", () => {
  test("leads automatic setup with Entri before optional and manual DNS details", () => {
    const html = renderToStaticMarkup(
      <EmailDnsConnection
        token="0123456789abcdef0123456789abcdef"
        connection={{
          brandName: "Example Stays",
          rootDomain: "example.com",
          automaticAvailable: true,
          status: {
            sendingDomain: "post.example.com",
            records: [
              {
                type: "TXT",
                host: "selector._domainkey.post",
                value: "dkim-value",
                ttl: 300,
              },
              {
                type: "CNAME",
                host: "pm-bounces.post",
                value: "pm.mtasv.net",
                ttl: 300,
              },
            ],
            dkimVerified: false,
            returnPathVerified: false,
            verified: false,
          },
          dmarc: {
            state: "missing",
            suggestedRecord: {
              type: "TXT",
              host: "_dmarc.post",
              value: "v=DMARC1; p=none",
              ttl: 300,
            },
          },
        }}
      />,
    );

    const entri = html.indexOf("Connect automatically with Entri");
    const dmarc = html.indexOf("Email protection (DMARC)");
    const manual = html.indexOf("Set up manually");

    expect(entri).toBeGreaterThan(-1);
    expect(dmarc).toBeGreaterThan(entri);
    expect(manual).toBeGreaterThan(dmarc);
  });
});
