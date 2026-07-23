import * as React from "react";
import { Link } from "@react-email/components";

import { EmailLayoutInline } from "./components/EmailLayoutInline";

interface PasswordResetInlineProps {
  resetUrl: string;
}

export const PasswordResetInline = ({
  resetUrl = "https://example.com/reset-password?token=abc123",
}: PasswordResetInlineProps) => {
  return (
    <EmailLayoutInline preview="Reset your Wander Growth password">
      <h1
        style={{
          marginBottom: "24px",
          fontSize: "30px",
          fontWeight: 600,
          color: "#111827",
          lineHeight: "1.2",
          margin: "0 0 24px 0",
        }}
      >
        Reset your password
      </h1>

      <p
        style={{
          marginBottom: "16px",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#374151",
          margin: "0 0 16px 0",
        }}
      >
        We received a request to reset the password for your Wander Growth
        account. Click the button below to choose a new one.
      </p>

      <div style={{ margin: "32px 0" }}>
        <Link
          href={resetUrl}
          style={{
            display: "inline-block",
            backgroundColor: "#e11d48",
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: 600,
            textAlign: "center",
            textDecoration: "none",
            borderRadius: "8px",
            padding: "12px 24px",
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
          }}
        >
          Reset Password
        </Link>
      </div>

      <p
        style={{
          marginBottom: "16px",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#374151",
          margin: "0 0 16px 0",
        }}
      >
        If you didn&apos;t request a password reset, you can safely ignore this
        email — your password will stay the same.
      </p>

      <p
        style={{
          fontSize: "14px",
          color: "#6b7280",
          margin: 0,
        }}
      >
        This reset link will expire in 1 hour for security reasons.
      </p>
    </EmailLayoutInline>
  );
};

export default PasswordResetInline;
