"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  const [withLinks, setWithLinks] = useState(true);
  const [customerIo, setCustomerIo] = useState(false);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  const email = composeOnboardingEmail({
    brandName,
    rootDomain,
    sendingDomain,
    records,
    customerIo,
    links: withLinks ? links : null,
  });

  async function copy(part: "subject" | "body") {
    try {
      if (part === "subject")
        await navigator.clipboard.writeText(email.subject);
      else if (typeof ClipboardItem === "undefined")
        await navigator.clipboard.writeText(email.text);
      else
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([email.html], { type: "text/html" }),
            "text/plain": new Blob([email.text], { type: "text/plain" }),
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
          {verified ? `${sendingDomain} verified` : sendingDomain}
        </Badge>
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="onboarding-email-links"
              checked={withLinks}
              onCheckedChange={(value) => setWithLinks(value === true)}
            />
            <Label htmlFor="onboarding-email-links">Include links</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="onboarding-email-cio"
              checked={customerIo}
              onCheckedChange={(value) => setCustomerIo(value === true)}
            />
            <Label htmlFor="onboarding-email-cio">Customer.io records</Label>
          </div>
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
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
        <p className="font-medium">{email.subject}</p>
        <div
          className="space-y-3 break-words [&_a]:underline [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5"
          // Composed locally from escaped brand fields and Postmark records.
          dangerouslySetInnerHTML={{ __html: email.html }}
        />
      </div>
    </WorkspaceCard>
  );
}
