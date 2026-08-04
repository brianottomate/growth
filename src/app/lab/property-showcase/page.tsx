import type { Metadata } from "next";

import { PropertyShowcaseLab } from "./property-showcase-lab";

export const metadata: Metadata = {
  title: "North Topsail showcase · Lab",
  description:
    "A private scroll-world storyboard for a frame-conditioned Wander property tour.",
};

export default function PropertyShowcasePage() {
  return <PropertyShowcaseLab />;
}
