import type { Metadata } from "next";
import { z } from "zod";
import { CONNECTOR_WIDGETS } from "@/server/mcp/connector-widgets";
import { MCP_TOOLS } from "@/server/ai/capabilities";
import { ConnectorWorkbench } from "./ConnectorWorkbench";
import { renderDesignSystemNewsletter } from "@/server/email/design-system-newsletter-renderer";
import { emailDocumentDraftSchema } from "@/lib/email-document";
import { getEmailDraftOutputSchema } from "@/server/ai/capabilities/outputs/email";
import { connectorFixtures, type ConnectorFixture } from "./fixtures";

export const metadata: Metadata = {
  title: "Connector UI workbench | Growth Lab",
};
export default async function ConnectorWorkbenchPage() {
  const fixtures: Record<string, ConnectorFixture[]> = {
    ...connectorFixtures,
    email: await Promise.all(
      (connectorFixtures.email ?? []).map(async (fixture) => {
        const payload = fixture.payload as {
          ok: true;
          action: string;
          data: unknown;
        };
        const data = getEmailDraftOutputSchema.parse(payload.data);
        const rendered = await renderDesignSystemNewsletter({
          document: emailDocumentDraftSchema.parse(data.document),
          brandName: data.brand.name,
        });
        return {
          ...fixture,
          payload: {
            ...payload,
            data: { ...data, preview: { html: rendered.html, warnings: [] } },
          },
        };
      }),
    ),
  };
  const widgets = CONNECTOR_WIDGETS.map((widget) => {
    const schemas = Object.fromEntries(
      [widget.tool, ...("aliases" in widget ? widget.aliases : [])].map(
        (tool) => [tool, MCP_TOOLS[tool]!.resultSchema],
      ),
    );
    for (const fixture of fixtures[widget.id] ?? [])
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
  return <ConnectorWorkbench widgets={widgets} fixturesByWidget={fixtures} />;
}
