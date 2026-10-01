import type { Metadata } from "next";
import {
  GROWTH_CAPABILITY_ACTIONS,
  GROWTH_CAPABILITY_LABELS,
} from "@/lib/growth-capabilities";
import { policyForGrowthTool } from "@/server/ai/kernel/policy";
import { AssistantGallery } from "./AssistantGallery";

export const metadata: Metadata = { title: "Assistant gallery | Growth Lab" };
export default function AssistantGalleryPage() {
  const catalog = Object.entries(GROWTH_CAPABILITY_ACTIONS).flatMap(
    ([capability, actions]) =>
      actions.map((action) => ({
        capability,
        action,
        label:
          GROWTH_CAPABILITY_LABELS[
            capability as keyof typeof GROWTH_CAPABILITY_LABELS
          ],
        ...policyForGrowthTool(capability, { action }),
      })),
  );
  return <AssistantGallery catalog={catalog} />;
}
