"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MARKETING_SUBDOMAIN } from "@/lib/email-dns";

export function EmailDnsSetup({
  brandId,
  rootDomain,
  sendingDomain,
}: {
  brandId: string;
  rootDomain: string;
  sendingDomain?: string;
}) {
  const [root, setRoot] = useState(rootDomain);
  const [subdomain, setSubdomain] = useState(
    sendingDomain?.slice(0, -(rootDomain.length + 1)) ||
      DEFAULT_MARKETING_SUBDOMAIN,
  );
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const prepare = useMutation(
    orpc.brand.prepareEmailDns.mutationOptions({
      onSuccess: (result) => {
        setUrl(`${window.location.origin}${result.path}`);
        setExpiresAt(result.expiresAt);
        setCopied(false);
      },
    }),
  );

  async function prepareLink(replaceLink = false) {
    setUrl(null);
    setCopyError(null);
    await prepare
      .mutateAsync({ brandId, rootDomain: root, subdomain, replaceLink })
      .catch(() => undefined);
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyError("Copy is unavailable. Select the link below to copy it.");
    }
  }

  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div>
        <h2 className="text-lg font-semibold">Marketing email domain</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepare email authentication and a seven-day connection link for the
          person who manages this brand&apos;s DNS.
        </p>
      </div>
      {sendingDomain && (
        <p className="text-sm">Currently configured: {sendingDomain}</p>
      )}
      <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email-root-domain">Brand domain</Label>
          <Input
            id="email-root-domain"
            value={root}
            onChange={(event) => setRoot(event.target.value)}
            placeholder="wander.com"
            disabled={prepare.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-marketing-subdomain">Marketing subdomain</Label>
          <Input
            id="email-marketing-subdomain"
            value={subdomain}
            onChange={(event) => setSubdomain(event.target.value)}
            placeholder={DEFAULT_MARKETING_SUBDOMAIN}
            disabled={prepare.isPending}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {subdomain || "…"}.{root || "your-domain.com"} · Preparing registers the
        domain in Postmark and keeps an active link for the same domain;
        changing the domain replaces it. It does not change DNS or enable
        sending.
      </p>
      <Button
        onClick={() => void prepareLink()}
        disabled={prepare.isPending || !root || !subdomain}
      >
        {prepare.isPending ? "Preparing…" : "Get connection link"}
      </Button>
      {prepare.error && (
        <p role="alert" className="text-sm text-destructive">
          {prepare.error.message}
        </p>
      )}
      <Button
        variant="outline"
        disabled={prepare.isPending || !root || !subdomain}
        onClick={() => void prepareLink(true)}
      >
        Replace link
      </Button>
      {url && (
        <div className="space-y-3">
          <a
            href={`${url}?noping=1`}
            target="_blank"
            rel="noreferrer"
            className="block text-sm break-all underline"
          >
            {url}
          </a>
          <Button variant="outline" onClick={copy}>
            {copied ? "Copied" : "Copy email connection link"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {expiresAt && <>Expires {new Date(expiresAt).toLocaleString()}. </>}
            Share only with this brand&apos;s DNS administrator. This link
            grants email setup access only.
          </p>
        </div>
      )}
      {copyError && (
        <p role="alert" className="text-sm text-destructive">
          {copyError}
        </p>
      )}
    </section>
  );
}
