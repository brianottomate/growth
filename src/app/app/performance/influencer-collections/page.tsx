import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/server/workspace-actor";
import { HomeGroupSharesManager } from "./HomeGroupSharesManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Influencers · Performance",
};

export default async function HomeGroupSharesPage() {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  return <HomeGroupSharesManager key={actor.orgId} orgId={actor.orgId} />;
}
