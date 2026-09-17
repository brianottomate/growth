import type { Metadata } from "next";

import { PerformancePrototype } from "./PerformancePrototype";

export const metadata: Metadata = {
  title: "Client journey prototype · Wander Performance",
};

export default function PerformancePrototypePage() {
  return <PerformancePrototype />;
}
