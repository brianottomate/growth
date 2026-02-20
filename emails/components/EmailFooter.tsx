import { Text } from "@react-email/components";

interface EmailFooterProps {
  disclaimer?: string;
}

export const EmailFooter = ({ disclaimer }: EmailFooterProps) => (
  <>
    {disclaimer && (
      <Text className="mt-6 text-sm text-gray-500">{disclaimer}</Text>
    )}
    <Text className="mt-4 text-xs text-gray-400">
      © {new Date().getFullYear()} AppName. All rights reserved.
    </Text>
  </>
);
