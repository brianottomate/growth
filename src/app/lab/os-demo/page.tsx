import type { Metadata } from "next";
import { OsDemo } from "./os-demo";

export const metadata: Metadata = { title: "Ask WanderOS · Growth Lab" };
export default function Page() {
  return <OsDemo />;
}
