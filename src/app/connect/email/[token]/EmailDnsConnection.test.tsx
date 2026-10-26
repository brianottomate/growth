import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EmailDnsConnection } from "./EmailDnsConnection";

describe("EmailDnsConnection", () => {
  test("leads with three Entri steps before optional and manual DNS details", () => {
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
    const steps = html.indexOf("1. Click Connect with Entri.");
    const optIn = html.indexOf("Also add recommended email protection");
    const button = html.indexOf("Connect with Entri<");
    const technical = html.indexOf("Manual setup and technical details");
    const dmarc = html.indexOf("Email protection (DMARC)");
    const manual = html.indexOf("Set up manually");

    expect(entri).toBeGreaterThan(-1);
    expect(steps).toBeGreaterThan(entri);
    expect(optIn).toBeGreaterThan(steps);
    expect(button).toBeGreaterThan(optIn);
    expect(technical).toBeGreaterThan(button);
    expect(dmarc).toBeGreaterThan(technical);
    expect(manual).toBeGreaterThan(dmarc);
  });

  test("omits no-action DMARC guidance when an existing policy was found", () => {
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
            ],
            dkimVerified: false,
            returnPathVerified: false,
            verified: false,
          },
          dmarc: {
            state: "found",
            hostname: "_dmarc.example.com",
            value: "v=DMARC1; p=none",
            policy: "none",
            inherited: true,
          },
        }}
      />,
    );

    expect(html).toContain("Connect automatically with Entri");
    expect(html).toContain("Manual setup and technical details");
    expect(html).not.toContain("Email protection (DMARC)");
    expect(html).not.toContain("No additional DMARC record is needed");
  });

  test("opens manual setup when Entri is unavailable", () => {
    const html = renderToStaticMarkup(
      <EmailDnsConnection
        token="0123456789abcdef0123456789abcdef"
        connection={{
          brandName: "Example Stays",
          rootDomain: "example.com",
          automaticAvailable: false,
          status: {
            sendingDomain: "post.example.com",
            records: [
              {
                type: "TXT",
                host: "selector._domainkey.post",
                value: "dkim-value",
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

    expect(html).not.toContain("Connect with Entri");
    expect(html).toContain("Automatic connection is not available yet");
    expect(html).toContain(
      '<details class="mt-8 rounded-xl border p-5" open="">',
    );
    expect(html).toContain("Set up manually");
  });
});
