import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";
import { SmartLink } from "@/components/ui/smart-link";

export const metadata = {
  title: "Terms of Service",
  description: "The terms and conditions governing your use of our services.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div className="mb-12 text-center">
        <Heading variant={{ base: "display-sm", md: "display" }} as="h1">
          Terms of Service
        </Heading>
        <Text variant="body" color="secondary" className="mt-4">
          Last updated January 2026
        </Text>
      </div>

      <div className="prose prose-gray dark:prose-invert lg:prose-lg max-w-none">
        <h2>1. Agreement to Terms</h2>
        <p>
          By accessing or using our services, you agree to be bound by these
          Terms of Service and our Privacy Policy. If you do not agree to these
          Terms, do not access or use our services.
        </p>

        <h2>2. Description of Services</h2>
        <p>
          We provide a web-based platform that allows users to access various
          features and functionality as described on our website.
        </p>

        <h2>3. User Accounts</h2>
        <p>
          To use certain features, you may need to create an account. You agree
          to:
        </p>
        <ul>
          <li>Provide accurate and complete information</li>
          <li>Maintain the security of your account credentials</li>
          <li>Notify us immediately of any unauthorized use</li>
          <li>Be responsible for all activity under your account</li>
        </ul>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Violate any applicable laws or regulations</li>
          <li>Infringe on intellectual property rights</li>
          <li>Transmit harmful code or malware</li>
          <li>Attempt unauthorized access to our systems</li>
          <li>Use the service for any illegal purpose</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <p>
          All content, features, and functionality of our services are owned by
          us or our licensors and are protected by copyright, trademark, and
          other intellectual property laws.
        </p>

        <h2>6. Payments and Subscriptions</h2>
        <p>
          If you purchase a subscription or other paid services, you agree to
          pay all fees as described at the time of purchase. Payments are
          processed by third-party payment processors.
        </p>

        <h2>7. Disclaimers</h2>
        <p>
          THE SERVICES ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
          AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
          IMPLIED.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES.
        </p>

        <h2>9. Termination</h2>
        <p>
          We may suspend or terminate your access to our services at any time,
          with or without cause or notice.
        </p>

        <h2>10. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. We will
          notify you of material changes by email or through our website. Your
          continued use after changes take effect constitutes acceptance.
        </p>

        <h2>11. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with
          applicable law. Any disputes shall be resolved in the appropriate
          courts.
        </p>

        <h2>12. Contact Information</h2>
        <p>
          For questions about these Terms, please contact us at{" "}
          <SmartLink href="mailto:legal@wander.com">legal@wander.com</SmartLink>
        </p>
      </div>
    </div>
  );
}
