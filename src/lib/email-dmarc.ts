import type { EmailDnsRecord } from "./email-dns";

type Policy = "none" | "quarantine" | "reject";
export type DmarcLookup = { records: string[] } | { unavailable: true };
export type EmailDmarcStatus =
  | {
      state: "found";
      hostname: string;
      inherited: boolean;
      policy: Policy;
      value: string;
    }
  | { state: "missing"; suggestedRecord: EmailDnsRecord }
  | { state: "invalid" | "unavailable"; hostname: string };

/** Conservative policy inspection. Ambiguous/malformed records never become a suggestion to overwrite. */
function inspect(records: string[]) {
  const candidates = records.filter((r) => /\bDMARC1\b/i.test(r));
  if (!candidates.length)
    return { state: records.length ? "invalid" : "missing" } as const;
  if (
    candidates.length !== 1 ||
    !/^\s*v\s*=\s*DMARC1\s*(?:;|$)/.test(candidates[0]!)
  )
    return { state: "invalid" } as const;
  const tags = new Map<string, string>();
  for (const piece of candidates[0]!.trim().split(";")) {
    if (!piece.trim()) continue;
    const match = /^\s*([a-z]+)\s*=\s*(\S.*?)\s*$/i.exec(piece);
    if (!match || tags.has(match[1]!.toLowerCase()))
      return { state: "invalid" } as const;
    tags.set(match[1]!.toLowerCase(), match[2]!);
  }
  const policy = tags.get("p");
  const subPolicy = tags.get("sp");
  if (
    tags.get("v") !== "DMARC1" ||
    !isPolicy(policy) ||
    (subPolicy !== undefined && !isPolicy(subPolicy))
  )
    return { state: "invalid" } as const;
  for (const tag of ["adkim", "aspf"]) {
    if (tags.has(tag) && !["r", "s"].includes(tags.get(tag)!))
      return { state: "invalid" } as const;
  }
  return { state: "found", policy, subPolicy, value: candidates[0]! } as const;
}
function isPolicy(value: string | undefined): value is Policy {
  return value === "none" || value === "quarantine" || value === "reject";
}

export function emailDmarcStatus(
  rootDomain: string,
  sendingDomain: string,
  direct: DmarcLookup,
  root: DmarcLookup,
): EmailDmarcStatus {
  const directHost = `_dmarc.${sendingDomain}`;
  if ("unavailable" in direct)
    return { state: "unavailable", hostname: directHost };
  const own = inspect(direct.records);
  if (own.state === "invalid")
    return { state: "invalid", hostname: directHost };
  if (own.state === "found")
    return {
      state: "found",
      hostname: directHost,
      inherited: false,
      policy: own.policy,
      value: own.value,
    };
  const rootHost = `_dmarc.${rootDomain}`;
  if ("unavailable" in root)
    return { state: "unavailable", hostname: rootHost };
  const parent = inspect(root.records);
  if (parent.state === "invalid")
    return { state: "invalid", hostname: rootHost };
  if (parent.state === "found")
    return {
      state: "found",
      hostname: rootHost,
      inherited: true,
      policy: parent.subPolicy ?? parent.policy,
      value: parent.value,
    };
  return {
    state: "missing",
    suggestedRecord: {
      type: "TXT",
      host: `_dmarc.${sendingDomain.slice(0, -(rootDomain.length + 1))}`,
      value: "v=DMARC1; p=none",
      ttl: 300,
    },
  };
}

/** Only explicit consent plus a fresh, successful absence check can add a policy. */
export function optionalDmarcRecords(
  status: EmailDmarcStatus,
  includeStarter: boolean,
): EmailDnsRecord[] {
  return includeStarter && status.state === "missing"
    ? [status.suggestedRecord]
    : [];
}
