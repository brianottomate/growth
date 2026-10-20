import { Container } from "@wandercom/design-system-web/ui/container";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

export default function CollectionNotFound() {
  return (
    <Container layout="narrow" className="py-24 text-center">
      <Heading as="h1" variant="display-sm">
        This collection is unavailable
      </Heading>
      <Text color="secondary" className="mt-5">
        The link may have been revoked. Ask the person who shared it for a
        current link.
      </Text>
    </Container>
  );
}
