import type { Metadata } from "next";
import { z } from "zod";
import { CONNECTOR_WIDGETS } from "@/server/mcp/connector-widgets";
import { MCP_TOOLS } from "@/server/ai/capabilities";
import { ConnectorWorkbench } from "./ConnectorWorkbench";
import { connectorFixtures } from "./fixtures";

export const metadata: Metadata = {
  title: "Connector UI workbench | Growth Lab",
};
export default function ConnectorWorkbenchPage() {
  const widgets = CONNECTOR_WIDGETS.map((widget) => {
    const schemas = Object.fromEntries(
      [widget.tool, ...("aliases" in widget ? widget.aliases : [])].map(
        (tool) => [tool, MCP_TOOLS[tool]!.resultSchema],
      ),
    );
    for (const fixture of connectorFixtures[widget.id] ?? [])
      schemas[fixture.tool ?? widget.tool]!.parse(fixture.payload);
    return {
      ...widget,
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([tool, schema]) => [
          tool,
          JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" })),
        ]),
      ),
    };
  });
  return <ConnectorWorkbench widgets={widgets} />;
}
