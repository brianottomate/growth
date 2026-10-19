"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { EmailDnsRecord } from "@/lib/email-dns";
import { composeOnboardingEmail } from "@/lib/onboarding-email";

import { WorkspaceCard } from "../../../WorkspaceCard";

export function OnboardingEmail({
  brandName,
  rootDomain,
  sendingDomain,
  verified,
  records,
  links,
}: {
  brandName: string;
  rootDomain: string;
  sendingDomain: string;
  verified: boolean;
  records: EmailDnsRecord[];
  links: { intake: string | null; connect: string | null; dns: string | null };
}) {
  const [includeIntake, setIncludeIntake] = useState(true);
  const [includeConnect, setIncludeConnect] = useState(false);
  const [includeEmail, setIncludeEmail] = useState(false);
  const [includeRecords, setIncludeRecords] = useState(false);
  const [draftSubject, setDraftSubject] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [customerIo, setCustomerIo] = useState(false);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  const email = composeOnboardingEmail({
    brandName,
    rootDomain,
    sendingDomain,
    records,
    customerIo,
    includeDnsRecords: includeRecords,
    links: {
      intake: includeIntake ? links.intake : null,
      connect: includeConnect ? links.connect : null,
      dns: includeEmail ? links.dns : null,
    },
  });

  const subject = draftSubject ?? email.subject;
  const body = draftBody ?? email.text;
  const html =
    draftBody === null
      ? email.html
      : `<p>${draftBody.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`;

  async function copy(part: "subject" | "body") {
    try {
      if (part === "subject") await navigator.clipboard.writeText(subject);
      else if (typeof ClipboardItem === "undefined")
        await navigator.clipboard.writeText(body);
      else
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([body], { type: "text/plain" }),
          }),
        ]);
      setCopied(part);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  }

  return (
    <WorkspaceCard
      title="Onboarding email"
      icon={Mail}
      titleAccessory={
        <Badge variant={verified ? "default" : "outline"}>
          {sendingDomain
            ? verified
              ? `${sendingDomain} verified`
              : sendingDomain
            : "Email DNS not prepared"}
        </Badge>
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIncludeIntake(true);
              setIncludeConnect(false);
              setIncludeEmail(false);
            }}
          >
            Full onboarding
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIncludeIntake(false);
              setIncludeConnect(true);
              setIncludeEmail(false);
            }}
          >
            Connections only
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIncludeIntake(false);
              setIncludeConnect(false);
              setIncludeEmail(true);
            }}
          >
            Email setup only
          </Button>
          <Button size="sm" variant="outline" onClick={() => copy("subject")}>
            {copied === "subject" ? <Check /> : <Copy />}
            Subject
          </Button>
          <Button size="sm" onClick={() => copy("body")}>
            {copied === "body" ? <Check /> : <Copy />}
            Email
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4">
          {[
            {
              id: "intake",
              label: "Full onboarding (one link)",
              checked: includeIntake,
              change: setIncludeIntake,
              disabled: !links.intake,
            },
            {
              id: "connect",
              label: "Accounts follow-up",
              checked: includeConnect,
              change: setIncludeConnect,
              disabled: includeIntake || !links.connect,
            },
            {
              id: "dns",
              label: "Email setup follow-up",
              checked: includeEmail,
              change: setIncludeEmail,
              disabled: includeIntake || !links.dns,
            },
            {
              id: "records",
              label: "DNS records in email",
              checked: includeRecords,
              change: setIncludeRecords,
              disabled: !records.length,
            },
            {
              id: "cio",
              label: "Customer.io records",
              checked: customerIo,
              change: setCustomerIo,
              disabled: !records.length || !includeRecords,
            },
          ].map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <Checkbox
                id={`onboarding-${option.id}`}
                checked={option.checked}
                disabled={option.disabled}
                onCheckedChange={(value) => option.change(value === true)}
              />
              <Label htmlFor={`onboarding-${option.id}`}>{option.label}</Label>
            </div>
          ))}
        </div>
        {!links.dns && (
          <p className="text-xs text-muted-foreground">
            Prepare or renew the email / DNS setup link in the Email tab to
            include it here.
          </p>
        )}
        {(draftBody !== null || draftSubject !== null) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            Your edits are kept when link choices change.
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraftBody(null);
                setDraftSubject(null);
              }}
            >
              Reset to template
            </Button>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="onboarding-subject">Subject</Label>
          <Input
            id="onboarding-subject"
            value={subject}
            onChange={(event) => setDraftSubject(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="onboarding-body">Email body</Label>
          <Textarea
            id="onboarding-body"
            className="min-h-80"
            value={body}
            onChange={(event) => setDraftBody(event.target.value)}
          />
        </div>
      </div>
    </WorkspaceCard>
  );
}
