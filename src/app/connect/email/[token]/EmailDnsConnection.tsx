"use client";
import { EmailDmarcGuidance } from "./EmailDmarcGuidance";
import type { EmailDmarcStatus } from "@/lib/email-dmarc";
import { ClientPageViewBeacon } from "@/components/client-page/ClientPageViewBeacon";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EmailDnsStatus } from "@/lib/email-dns";
import type { createEmailEntriConfig } from "@/server/clients/entri.client";

type Connection = {
  brandName: string;
  rootDomain: string;
  automaticAvailable: boolean;
  status: EmailDnsStatus;
  dmarc: EmailDmarcStatus;
};

export function EmailDnsConnection({
  token,
  connection,
}: {
  token: string;
  connection: Connection;
}) {
  const [status, setStatus] = useState(connection.status);
  const [dmarc, setDmarc] = useState(connection.dmarc);
  const [includeStarter, setIncludeStarter] = useState(false);
  const [busy, setBusy] = useState<"connect" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function request(action: "session" | "verify") {
    const response = await fetch(`/connect/email/${token}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "session"
          ? { includeStarterDmarc: includeStarter && dmarc.state === "missing" }
          : {},
      ),
    });
    const data: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
          ? data.error
          : "Email setup could not complete. Please try again.",
      );
    return data;
  }

  async function connect() {
    setError(null);
    setBusy("connect");
    try {
      const config = (await request("session")) as Awaited<
        ReturnType<typeof createEmailEntriConfig>
      >;
      const { default: entri } = await import("entrijs");
      await entri.connectDomain(config);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Automatic setup could not open.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setError(null);
    setBusy("verify");
    try {
      const result = (await request("verify")) as EmailDnsStatus & {
        dmarc: EmailDmarcStatus;
      };
      setStatus(result);
      setDmarc(result.dmarc);
      setIncludeStarter(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Verification could not complete.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyRecord(index: number) {
    try {
      const record = status.records[index]!;
      await navigator.clipboard.writeText(
        `${record.type}\t${record.host}\t${record.value}`,
      );
      setCopied(index);
    } catch {
      setError(
        "Copy is unavailable. Select the record text and copy it manually.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <ClientPageViewBeacon
        endpoint={`/connect/email/${token}/view`}
        sessionKey={`email-dns:${token}`}
      />
      <p className="text-sm text-muted-foreground">
        {connection.brandName === "Wander"
          ? "Wander"
          : `Wander · ${connection.brandName}`}
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Connect your marketing email
      </h1>
      <p className="mt-3 text-muted-foreground">
        Send branded newsletters from <strong>{status.sendingDomain}</strong>.
        {connection.automaticAvailable && !status.verified
          ? ` Connect the DNS account for ${connection.rootDomain} automatically with Entri, or share this page with the person who manages it.`
          : ` Connect the DNS account for ${connection.rootDomain}, or share the records below with the person who manages it.`}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        This setup adds email authentication records. Your website and existing
        email inboxes keep their current configuration.
      </p>

      <section className="mt-8 space-y-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">
          {status.verified
            ? "Your domain is connected"
            : connection.automaticAvailable
              ? "Connect automatically with Entri"
              : "Finish email authentication"}
        </h2>
        {!status.verified && connection.automaticAvailable && (
          <p className="text-sm text-muted-foreground">
            Entri will guide you through the DNS connection. You will sign in
            with your domain provider and approve the email records.
          </p>
        )}
        {!status.verified &&
          connection.automaticAvailable &&
          dmarc.state === "missing" && (
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={includeStarter}
                onChange={(event) => setIncludeStarter(event.target.checked)}
                disabled={busy !== null}
              />
              <span>
                Also add the starter DMARC record for {status.sendingDomain}{" "}
                (optional, details below)
              </span>
            </label>
          )}
        {!status.verified && (
          <div className="flex flex-wrap gap-3">
            {connection.automaticAvailable && (
              <Button onClick={connect} disabled={busy !== null}>
                {busy === "connect" ? "Opening…" : "Connect with Entri"}
              </Button>
            )}
            <Button variant="outline" onClick={verify} disabled={busy !== null}>
              {busy === "verify" ? "Checking…" : "Check again"}
            </Button>
          </div>
        )}
        <ul className="space-y-2 text-sm">
          <li>
            Sending signature (DKIM):{" "}
            {status.dkimVerified ? "Verified" : "Pending"}
          </li>
          <li>
            Bounce handling (return-path):{" "}
            {status.returnPathVerified ? "Verified" : "Pending"}
          </li>
        </ul>
        {!connection.automaticAvailable && !status.verified && (
          <p className="text-sm text-muted-foreground">
            Automatic connection is not available yet. You can use the manual
            records below.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {!status.verified &&
            "DNS changes can take time to appear. After finishing setup, check verification here. "}
          Authentication does not launch a campaign or send any email.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <EmailDmarcGuidance
        dmarc={dmarc}
        rootDomain={connection.rootDomain}
        sendingDomain={status.sendingDomain}
      />

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">
          {status.verified ? "DNS records" : "Set up manually"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Add these records in the {connection.rootDomain} DNS zone. Hosts below
          are relative to that domain; some DNS providers ask for the full
          hostname instead. Set the CNAME to DNS only (unproxied).
        </p>
        {status.records.map((record, index) => (
          <div
            key={`${record.type}:${record.host}`}
            className="space-y-3 rounded-xl border p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <strong>{record.type}</strong>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyRecord(index)}
              >
                {copied === index ? "Copied" : "Copy record"}
              </Button>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  Host in {connection.rootDomain}
                </dt>
                <dd className="font-mono break-all">{record.host}</dd>
                <dt className="mt-2 text-muted-foreground">Full hostname</dt>
                <dd className="font-mono break-all">
                  {record.host}.{connection.rootDomain}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Value</dt>
                <dd className="font-mono break-all">{record.value}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">TTL</dt>
                <dd>{record.ttl} seconds</dd>
              </div>
            </dl>
          </div>
        ))}
      </section>
    </main>
  );
}
