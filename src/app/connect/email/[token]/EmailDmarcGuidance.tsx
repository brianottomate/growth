"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EmailDmarcStatus } from "@/lib/email-dmarc";

export function EmailDmarcGuidance({
  dmarc,
  rootDomain,
  sendingDomain,
}: {
  dmarc: EmailDmarcStatus;
  rootDomain: string;
  sendingDomain: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  async function copy() {
    if (dmarc.state !== "missing") return;
    try {
      const record = dmarc.suggestedRecord;
      await navigator.clipboard.writeText(
        `${record.type}\t${record.host}\t${record.value}`,
      );
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Email protection (DMARC)</h2>
      {dmarc.state === "found" ? (
        <>
          <p className="text-sm">
            {dmarc.inherited
              ? `${sendingDomain} inherits`
              : `${sendingDomain} has`}{" "}
            a <strong>{dmarc.policy}</strong> policy.
            {dmarc.policy === "quarantine"
              ? " Messages that fail authentication may be placed in spam."
              : dmarc.policy === "reject"
                ? " Messages that fail authentication may be rejected."
                : " This policy does not request spam placement or rejection for authentication failures."}
          </p>
          <p className="text-sm text-muted-foreground">
            No additional DMARC record is needed. Automatic setup preserves this
            policy.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer">View existing record</summary>
            <p className="mt-2 font-mono break-all">{dmarc.hostname}</p>
            <p className="mt-2 font-mono break-all">{dmarc.value}</p>
          </details>
        </>
      ) : dmarc.state === "missing" ? (
        <>
          <p className="text-sm">
            No DMARC policy was found for {sendingDomain} or {rootDomain}. We
            suggest this starter record for the marketing subdomain.
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">
                TXT host in {rootDomain}
              </dt>
              <dd className="font-mono break-all">
                {dmarc.suggestedRecord.host}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Full hostname</dt>
              <dd className="font-mono break-all">
                {dmarc.suggestedRecord.host}.{rootDomain}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Value</dt>
              <dd className="font-mono">{dmarc.suggestedRecord.value}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">TTL</dt>
              <dd>300 seconds</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            This starter policy does not request spam placement or rejection. It
            affects only {sendingDomain}. Reporting and stronger protection can
            be added after testing.
          </p>
          <Button size="sm" variant="outline" onClick={copy}>
            {copyState === "copied" ? "Copied" : "Copy suggested record"}
          </Button>
          {copyState === "failed" && (
            <p role="alert" className="text-sm">
              Select the record text to copy it manually.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {dmarc.state === "invalid"
            ? `The record at ${dmarc.hostname} needs review.`
            : "We could not check DMARC right now."}{" "}
          Automatic setup will leave DMARC unchanged. You can continue with DKIM
          and bounce handling, then ask your DNS administrator to review the
          policy.
        </p>
      )}
    </section>
  );
}
