import type { EmailDnsRecord } from "./email-dns";

type OnboardingDnsRecord =
  | EmailDnsRecord
  | { type: "MX"; host: string; value: string; priority: number };

/** Customer.io's sending records, copied as given; Growth stores none. */
const CUSTOMER_IO_SUBDOMAIN = "cio91472";
const CUSTOMER_IO_RECORDS: OnboardingDnsRecord[] = [
  {
    type: "MX",
    host: CUSTOMER_IO_SUBDOMAIN,
    value: "mxa.mailgun.org",
    priority: 10,
  },
  {
    type: "MX",
    host: CUSTOMER_IO_SUBDOMAIN,
    value: "mxb.mailgun.org",
    priority: 10,
  },
  {
    type: "TXT",
    host: CUSTOMER_IO_SUBDOMAIN,
    value: "v=spf1 include:mailgun.org ~all",
    ttl: 300,
  },
  {
    type: "TXT",
    host: `cio._domainkey.${CUSTOMER_IO_SUBDOMAIN}`,
    value:
      "k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq1EF+RJHKRe2zYYy1H/PpGT01m4AdtJwv0wqZy7zUWkXQ0EF9tlXSXoL4VUrEt2zPu63ZvBJEG+6U6IpA5AScIyJjP5JG3YYVn8MYV1BRMEv2ixz6WgdY8SnuHeDr3KjY00ziGXWOdsDaoPTQotOrVJ1lj34TOAGJjZLkGxrFZZLcUk7L4hHQsLotBW98DXjVe/Ed96rK+OvpJaoJYB3gEFIA41QXkd1HFyuXYXL7R5LImaa2gKY1Ux+Wkoc6lepSbxZmvNBSIEdqg6ctcpJ4MNW/0sdJQdgdpWL20wqYGy0AfZNCDgQajsyjtcaZ80Xo+3K5k4iNEJr/7d02ELlwQIDAQAB",
    ttl: 300,
  },
];

export type OnboardingEmailInput = {
  brandName: string;
  rootDomain: string;
  sendingDomain: string;
  records: EmailDnsRecord[];
  customerIo: boolean;
  links: {
    intake: string | null;
    connect: string | null;
    dns: string | null;
  } | null;
};

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * The welcome email a rep pastes into their own inbox: the client's links
 * when wanted, and the Postmark records for the marketing subdomain.
 */
export function composeOnboardingEmail(input: OnboardingEmailInput) {
  const { brandName, rootDomain, sendingDomain, links } = input;
  const records: OnboardingDnsRecord[] = input.customerIo
    ? [...input.records, ...CUSTOMER_IO_RECORDS]
    : input.records;
  const domains = input.customerIo
    ? `${sendingDomain} and ${CUSTOMER_IO_SUBDOMAIN}.${rootDomain}`
    : sendingDomain;
  const subject = `Getting ${brandName} set up with Wander Performance`;
  const steps = [
    links?.intake
      ? { label: "Tell us about your business", url: links.intake }
      : null,
    links?.connect
      ? {
          label: "Connect your Facebook, Instagram and ad accounts",
          url: links.connect,
        }
      : null,
    links?.dns
      ? {
          label: `Add the email records in one click (or by hand, below)`,
          url: links.dns,
        }
      : null,
  ].filter((step): step is { label: string; url: string } => Boolean(step));

  const dnsIntro = `To send email to your guests from ${domains}, please add these ${records.length} records at your DNS provider (GoDaddy, Cloudflare, Squarespace or similar). "Host" is the part before ${rootDomain}. Leave TTL at the default.`;
  const scope = `They only touch ${domains}. Your website and current email are not affected.`;
  const recordLines = (record: OnboardingDnsRecord, index: number) => [
    `${index + 1}) Type: ${record.type}`,
    `   Host: ${record.host}`,
    `   ${record.type === "TXT" ? "Value" : "Points to"}: ${record.value}`,
    ...(record.type === "MX" ? [`   Priority: ${record.priority}`] : []),
  ];

  const text = [
    "Hi,",
    "",
    "Welcome to Wander Performance. A few steps get your campaigns and email running.",
    ...(steps.length
      ? [
          "",
          ...steps.flatMap((step, index) => [
            `${index + 1}. ${step.label}:`,
            `   ${step.url}`,
          ]),
        ]
      : []),
    "",
    dnsIntro,
    "",
    ...records.flatMap((record, index) => [...recordLines(record, index), ""]),
    scope,
    "",
    "Reply once they're added and we'll confirm on our end.",
    "",
    "Thanks,",
  ].join("\n");

  const mono =
    'style="font-family:monospace;font-size:13px;word-break:break-all"';
  const html = [
    "<p>Hi,</p>",
    "<p>Welcome to Wander Performance. A few steps get your campaigns and email running.</p>",
    steps.length
      ? `<ol>${steps
          .map(
            (step) =>
              `<li>${escape(step.label)}: <a href="${escape(step.url)}">${escape(step.url)}</a></li>`,
          )
          .join("")}</ol>`
      : "",
    `<p>${escape(dnsIntro)}</p>`,
    ...records.map(
      (record, index) =>
        `<p ${mono}>${recordLines(record, index).map(escape).join("<br>")}</p>`,
    ),
    `<p>${escape(scope)}</p>`,
    "<p>Reply once they're added and we'll confirm on our end.</p>",
    "<p>Thanks,</p>",
  ].join("");

  return { subject, text, html };
}
