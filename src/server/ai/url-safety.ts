/**
 * SSRF guard for model-chosen URLs. Exa and Firecrawl fetch remotely today,
 * but rejecting internal and non-web targets here keeps the tool safe if the
 * implementation changes later and prevents obvious prompt-injection abuse.
 */

export interface UrlClassification {
  ok: boolean;
  url?: string;
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".internal",
  ".local",
  ".intranet",
  ".cluster.local",
];

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isPrivateIpv4(host: string): boolean {
  const match = IPV4_RE.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    a! >= 224
  );
}

export function isPrivateIpv6(rawHost: string): boolean {
  let host = rawHost.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host.includes(":")) return false;
  if (host === "::" || host === "::1") return true;
  const mapped = /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(host)) return true;
  return /^(0:){7}1$/.test(host);
}

export function classifyFetchUrl(rawUrl: string): UrlClassification {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only public http(s) URLs can be read." };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "URLs with embedded credentials can't be read.",
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return { ok: false, reason: "That host is not a public web address." };
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(parsed.hostname)) {
    return { ok: false, reason: "That address is a private or internal host." };
  }
  if (!host.includes(".") && !host.includes(":")) {
    return { ok: false, reason: "That host is not a public web address." };
  }

  parsed.hash = "";
  return { ok: true, url: parsed.toString() };
}
