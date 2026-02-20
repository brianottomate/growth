import { Section, Img } from "@react-email/components";

export const EmailHeader = () => (
  <Section className="mb-8">
    <Img
      src="https://placeholder.com/logo.png" // TODO: Add actual logo URL
      alt="Logo"
      width="120"
      height="40"
      className="mx-auto"
    />
  </Section>
);
