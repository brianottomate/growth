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
  blogPlatformPostId,
}: {
  contentPostId: string;
  brandId: string;
  title: string;
  blogPlatformPostId?: string;
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
            disabled={create.isPending || query.isPending}
            onClick={() => {
              if (type === "article" && blogPlatformPostId) {
                router.push(`/app/blog/${blogPlatformPostId}`);
                return;
              }
              const existing = query.data?.documents.find(
                (d) =>
                  (type === "article" || type === "email") && d.type === type,
              );
              if (existing) {
                router.push(existing.url);
                return;
              }
              const document = emptyCreativeDocument(type, title);
              create.mutate({
                brandId,
                contentPostId,
                title: `${title} · ${type}`,
                document,
              });
            }}
          >
            {type === "article" && blogPlatformPostId
              ? "Open blog"
              : (type === "article" || type === "email") &&
                  query.data?.documents.some((d) => d.type === type)
                ? `Open ${type}`
                : type === "article"
                  ? "Prepare blog brief"
                  : `New ${type}`}
          </Button>
        ))}
      </div>
      {create.error && <p role="alert">{create.error.message}</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      <div className="space-y-2">
        {query.data?.documents.map((doc) => (
          <article
            key={doc.id}
            className="space-y-3 rounded-md border p-4 text-sm"
          >
            <h3 className="font-medium">{doc.title}</h3>
            <p className="text-muted-foreground">
              {doc.type === "article"
                ? doc.hasArticleBody
                  ? "Article draft"
                  : "Brief ready · article not written"
                : doc.type}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={doc.url}>
                {doc.type === "article" && doc.hasArticleBody
                  ? "Open article"
                  : "Edit brief"}
              </Link>
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
