import type { Metadata } from "next";

import { PropertyMotionLab } from "./property-motion-lab";

export const metadata: Metadata = {
  title: "Property-card motion · Lab",
  description:
    "A private comparison harness for Wander property-card motion treatments.",
};

export default function PropertyMotionPage() {
  return <PropertyMotionLab />;
}
