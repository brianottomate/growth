"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import {
  creativeDocumentTypes,
  emptyCreativeDocument,
} from "@/lib/creative-document";

export function CreativeDocuments({
  contentPostId,
  brandId,
  title,
  direction,
}: {
  contentPostId: string;
  brandId: string;
  title: string;
  direction: string;
}) {
  const router = useRouter();
  const query = useQuery(
    orpc.creativeWork.documents.queryOptions({ input: { contentPostId } }),
  );
  const create = useMutation(
    orpc.creativeWork.createDocument.mutationOptions({
      onSuccess: (result) => router.push(result.url),
    }),
  );
  return (
    <section className="my-6 space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Creative documents</h2>
      <p className="text-sm text-muted-foreground">
        Prepare a brief, produce the work, then choose where to use it.
      </p>
      <div className="flex flex-wrap gap-2">
        {creativeDocumentTypes.map((type) => (
          <Button
            key={type}
            variant="outline"
            disabled={create.isPending}
            onClick={() => {
              const document = emptyCreativeDocument(type, title);
              document.brief.purpose = title;
              document.brief.direction = direction;
              create.mutate({
                brandId,
                contentPostId,
                title: `${title} · ${type}`,
                document,
              });
            }}
          >
            New {type}
          </Button>
        ))}
      </div>
      {create.error && <p role="alert">{create.error.message}</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      <div className="space-y-2">
        {query.data?.documents.map((doc) => (
          <Link
            className="block rounded-md border p-3 text-sm hover:bg-muted"
            key={doc.id}
            href={doc.url}
          >
            {doc.title}{" "}
            <span className="text-muted-foreground">· {doc.type}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
