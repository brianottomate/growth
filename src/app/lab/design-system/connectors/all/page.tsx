import type { Metadata } from "next";
import { loadConnectorWorkbench } from "../load";
import { ConnectorSheet } from "./ConnectorSheet";

export const metadata: Metadata = {
  title: "All connector widgets | Growth Lab",
};
export default async function ConnectorSheetPage() {
  const { widgets, fixtures } = await loadConnectorWorkbench();
  return <ConnectorSheet widgets={widgets} fixturesByWidget={fixtures} />;
}
