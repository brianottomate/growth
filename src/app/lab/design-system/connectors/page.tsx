import type { Metadata } from "next";
import { ConnectorWorkbench } from "./ConnectorWorkbench";
import { loadConnectorWorkbench } from "./load";

export const metadata: Metadata = {
  title: "Connector UI workbench | Growth Lab",
};
export default async function ConnectorWorkbenchPage() {
  const { widgets, fixtures } = await loadConnectorWorkbench();
  return <ConnectorWorkbench widgets={widgets} fixturesByWidget={fixtures} />;
}
