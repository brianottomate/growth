import { CreativeDocumentWorkspace } from "./workspace";
export default async function CreativeDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  return <CreativeDocumentWorkspace documentId={(await params).documentId} />;
}
