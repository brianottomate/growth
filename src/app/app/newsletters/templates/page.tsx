import { TemplateWall } from "./TemplateWall";
import references from "@/server/ai/prompts/email-recipe-references.json";

export const metadata = { title: "Email templates | Wander Growth" };

export default async function TemplateLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { brandId } = await searchParams;
  return (
    <TemplateWall
      brandId={brandId}
      referenceCopy={Object.fromEntries(
        Object.entries(references).map(([id, reference]) => [
          id,
          reference.referenceText,
        ]),
      )}
    />
  );
}
