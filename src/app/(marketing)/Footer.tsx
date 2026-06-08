import { Text } from "@wandercom/design-system-web/ui/text";

export default function Footer() {
  return (
    <footer className="border-secondary border-t">
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-12 sm:py-16 lg:px-8">
        <Text variant="body-sm" color="tertiary" className="text-center">
          &copy; {new Date().getFullYear()} Wander. All rights reserved.
        </Text>
      </div>
    </footer>
  );
}
