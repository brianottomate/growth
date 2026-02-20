import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface OrganizationInvitationInlineProps {
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  role?: string;
}

export const OrganizationInvitationInline = ({
  organizationName = "Acme Inc",
  inviterName = "John Doe",
  inviteUrl = "https://example.com/org-invite/abc123",
  role = "member",
}: OrganizationInvitationInlineProps) => {
  const previewText = `${inviterName} invited you to join ${organizationName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={{ marginBottom: "32px" }}>
            <Img
              src="https://placeholder.com/logo.png"
              alt="Logo"
              width="120"
              height="40"
              style={{ margin: "0 auto" }}
            />
          </Section>

          {/* Main heading */}
          <Heading style={h1}>You&apos;ve been invited!</Heading>

          {/* Invitation card */}
          <div style={invitationCard}>
            <Text style={cardLabel}>Organization</Text>
            <Text style={cardTitle}>{organizationName}</Text>
            <Text style={cardSubtitle}>Invited by {inviterName}</Text>
            <Text style={cardRole}>
              Role: {role.charAt(0).toUpperCase() + role.slice(1)}
            </Text>
          </div>

          {/* Description */}
          <Text style={text}>
            You&apos;ve been invited to collaborate on {organizationName}.
            Accept this invitation to get started with your team.
          </Text>

          {/* CTA Button */}
          <Section style={{ marginTop: "32px", marginBottom: "32px" }}>
            <Button style={button} href={inviteUrl}>
              Accept Invitation
            </Button>
          </Section>

          {/* Footer */}
          <Text style={disclaimer}>
            If you don&apos;t want to join this organization or don&apos;t know
            who sent this invitation, you can safely ignore this email. This
            invitation will expire in 7 days.
          </Text>
          <Text style={footer}>
            © {new Date().getFullYear()} AppName. All rights reserved.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default OrganizationInvitationInline;

// Styles
const main = {
  backgroundColor: "#f9fafb",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  padding: "32px",
  borderRadius: "12px",
  maxWidth: "600px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
};

const h1 = {
  color: "#111827",
  fontSize: "30px",
  fontWeight: 600,
  margin: "0 0 24px",
  padding: 0,
};

const invitationCard = {
  backgroundColor: "#eff6ff",
  borderRadius: "8px",
  padding: "24px",
  marginBottom: "24px",
  border: "1px solid #dbeafe",
};

const cardLabel = {
  color: "#2563eb",
  fontSize: "14px",
  fontWeight: 600,
  margin: "0 0 8px",
};

const cardTitle = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: 600,
  margin: "0 0 4px",
};

const cardSubtitle = {
  color: "#4b5563",
  fontSize: "14px",
  margin: "0 0 8px",
};

const cardRole = {
  color: "#6b7280",
  fontSize: "12px",
  margin: 0,
};

const text = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const button = {
  backgroundColor: "#2563eb",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
};

const disclaimer = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "20px",
  marginTop: "24px",
  marginBottom: "16px",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: "16px",
  marginTop: "16px",
};
