"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings } from "lucide-react";
import { WorkspaceCard } from "../../../WorkspaceCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MARKETING_SUBDOMAIN } from "@/lib/email-dns";

export function EmailDnsSetup({
  brandId,
  rootDomain,
  sendingDomain,
  styleAction,
}: {
  brandId: string;
  rootDomain: string;
  sendingDomain?: string;
  styleAction?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dns = useQuery(
    orpc.brand.emailDnsStatus.queryOptions({
      input: { brandId },
      enabled: Boolean(sendingDomain),
    }),
  );
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
        void dns.refetch();
      },
    }),
  );

  const replace = useMutation(
    orpc.brand.replaceEmailDnsLink.mutationOptions({
      onSuccess: (result) => {
        setUrl(`${window.location.origin}${result.path}`);
        setExpiresAt(result.expiresAt);
        setCopied(false);
        void dns.refetch();
      },
    }),
  );

  async function prepareLink() {
    setUrl(null);
    setCopyError(null);
    await prepare
      .mutateAsync({ brandId, rootDomain: root, subdomain })
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
    <WorkspaceCard
      title="Email settings"
      icon={Settings}
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Configure domain
          </Button>
          {styleAction}
        </>
      }
    >
      {sendingDomain || prepare.data ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Sending domain</span>
          <span className="font-medium">
            {prepare.data?.sendingDomain ?? sendingDomain ?? "Not configured"}
          </span>
          {(sendingDomain || prepare.data) && (
            <span className="rounded-md border px-2 py-1 text-xs">
              {dns.isFetching
                ? "Checking authentication…"
                : dns.error
                  ? "Authentication status unavailable"
                  : dns.data?.status.verified
                    ? "Authenticated"
                    : dns.data
                      ? "Authentication pending"
                      : "Authentication not checked"}
            </span>
          )}
        </div>
      ) : (
        <EmptyState
          compact
          icon={Settings}
          title="Set up your sending domain"
          description="Connect a domain for branded marketing emails."
          actions={
            <Button size="sm" onClick={() => setOpen(true)}>
              Configure domain
            </Button>
          }
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent scrollable size="lg">
          <DialogHeader>
            <DialogTitle>Configure email domain</DialogTitle>
            <DialogDescription>
              Prepare a connection link for the person who manages this brand’s
              DNS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
                  disabled={prepare.isPending || replace.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-marketing-subdomain">
                  Marketing subdomain
                </Label>
                <Input
                  id="email-marketing-subdomain"
                  value={subdomain}
                  onChange={(event) => setSubdomain(event.target.value)}
                  placeholder={DEFAULT_MARKETING_SUBDOMAIN}
                  disabled={prepare.isPending || replace.isPending}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {subdomain || "…"}.{root || "your-domain.com"} · Preparing
              registers the domain in Postmark and keeps an active link for the
              same domain; changing the domain replaces it. It does not change
              DNS or enable sending.
            </p>
            <Button
              loading={prepare.isPending}
              onClick={() => void prepareLink()}
              disabled={
                prepare.isPending || replace.isPending || !root || !subdomain
              }
            >
              {prepare.isPending
                ? "Preparing connection link…"
                : "Get connection link"}
            </Button>
            {prepare.error && (
              <p role="alert" className="text-sm text-destructive">
                {prepare.error.message}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Replacing the current link keeps the saved domain{" "}
              {dns.data?.setup.sendingDomain ?? sendingDomain ?? "unchanged"}.
              Use Get connection link to apply edits to the domain above.
            </p>
            <Button
              variant="outline"
              disabled={prepare.isPending || replace.isPending || !dns.data}
              loading={replace.isPending}
              onClick={() => {
                setUrl(null);
                setCopyError(null);
                void replace.mutateAsync({ brandId }).catch(() => undefined);
              }}
            >
              Revoke and replace current link
            </Button>
            {replace.error && (
              <p role="alert" className="text-sm text-destructive">
                {replace.error.message}
              </p>
            )}
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
                  {expiresAt && (
                    <>Expires {new Date(expiresAt).toLocaleString()}. </>
                  )}
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
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceCard>
  );
}
