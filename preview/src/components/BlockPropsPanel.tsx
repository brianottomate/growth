import { Button } from "@wandercom/design-system-web/ui/button";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import type { PropDoc } from "../data/manifest";
import { manifest } from "../data/manifest";

export function BlockPropsPanel({ id }: { id: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const block = manifest.find((b) => b.id === id);

  if (!block?.propDocs || block.propDocs.length === 0) return null;

  return (
    <div className="border-surface-tertiary shrink-0 border-b px-6 py-4">
      <Button variant="ghost" onClick={() => setIsOpen((prev) => !prev)} className="-mx-6">
        {isOpen ? (
          <ChevronDownIcon className="size-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0" />
        )}
        <Heading as="h3" variant="headline-sm" color="primary">
          Props
        </Heading>
        <Text as="span" variant="body" color="tertiary" className="ml-0.5">
          ({block.propDocs.length})
        </Text>
      </Button>

      {isOpen && (
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-surface-tertiary border-b">
                <th className="pr-6 pb-2 text-left">
                  <Text variant="body-sm" color="tertiary" weight="medium">
                    Name
                  </Text>
                </th>
                <th className="pr-6 pb-2 text-left">
                  <Text variant="body-sm" color="tertiary" weight="medium">
                    Type
                  </Text>
                </th>
                <th className="pr-6 pb-2 text-left">
                  <Text variant="body-sm" color="tertiary" weight="medium">
                    Required
                  </Text>
                </th>
                <th className="pb-2 text-left">
                  <Text variant="body-sm" color="tertiary" weight="medium">
                    Description
                  </Text>
                </th>
              </tr>
            </thead>
            <tbody>
              {block.propDocs.map((prop: PropDoc) => (
                <tr key={prop.name} className="border-surface-tertiary/50 border-b last:border-0">
                  <td className="py-1.5 pr-6 align-top">
                    <code className="bg-surface-secondary rounded px-1 py-0.5 font-mono">
                      <Text variant="body-sm" color="primary" as="span">
                        {prop.name}
                      </Text>
                    </code>
                  </td>
                  <td className="py-1.5 pr-6 align-top">
                    <code className="font-mono text-[11px]">
                      <Text variant="body-sm" color="tertiary" as="span">
                        {prop.type}
                      </Text>
                    </code>
                  </td>
                  <td className="py-1.5 pr-6 align-top">
                    {prop.required ? (
                      <Text variant="body-sm" color="primary" as="span">
                        Yes
                      </Text>
                    ) : (
                      <Text variant="body-sm" color="tertiary" as="span">
                        —
                      </Text>
                    )}
                  </td>
                  <td className="py-1.5 align-top">
                    <Text variant="body-sm" color="secondary" as="span">
                      {prop.description}
                    </Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
