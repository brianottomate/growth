import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";

import { EmailFooter } from "./components/EmailFooter";
import { EmailHeader } from "./components/EmailHeader";
import { EmailLayout } from "./components/EmailLayout";

interface OrganizationInvitationProps {
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  role?: string;
}

export const OrganizationInvitation = ({
  organizationName = "Acme Inc",
  inviterName = "John Doe",
  inviteUrl = "https://example.com/org-invite/abc123",
  role = "member",
}: OrganizationInvitationProps) => {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to join ${organizationName}`}
    >
      <EmailHeader />

      <Heading className="mb-6 text-3xl font-semibold text-gray-900">
        You&apos;ve been invited!
      </Heading>

      {/* Invitation card */}
      <div className="mb-6 rounded-lg bg-blue-50 px-6 py-5 ring-1 ring-blue-100 ring-inset">
        <Text className="mb-2 text-sm font-semibold text-blue-600">
          Organization
        </Text>
        <Text className="mb-1 text-lg font-semibold text-gray-900">
          {organizationName}
        </Text>
        <Text className="mb-2 text-sm text-gray-600">
          Invited by {inviterName}
        </Text>
        <Text className="text-xs text-gray-500">
          Role: {role.charAt(0).toUpperCase() + role.slice(1)}
        </Text>
      </div>

      <Text className="mb-4 text-base leading-6 text-gray-700">
        You&apos;ve been invited to collaborate on {organizationName}. Accept
        this invitation to get started with your team.
      </Text>

      <Section className="my-8">
        <Button
          href={inviteUrl}
          className="rounded-lg bg-blue-600 px-6 py-3 text-center text-base font-semibold text-white no-underline shadow-sm hover:bg-blue-500"
        >
          Accept Invitation
        </Button>
      </Section>

      <EmailFooter disclaimer="If you don't want to join this organization or don't know who sent this invitation, you can safely ignore this email. This invitation will expire in 7 days." />
    </EmailLayout>
  );
};

export default OrganizationInvitation;
