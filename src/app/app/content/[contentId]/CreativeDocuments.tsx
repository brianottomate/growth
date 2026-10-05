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
}: {
  contentPostId: string;
  brandId: string;
  title: string;
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
              create.mutate({
                brandId,
                contentPostId,
                title: `${title} · ${type}`,
                document,
              });
            }}
          >
            {type === "article" ? "Prepare blog brief" : `New ${type}`}
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
            <dl className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
              {(
                [
                  ["Purpose", doc.brief.purpose],
                  ["Audience", doc.brief.audience],
                  ["Writing direction", doc.brief.direction],
                  ["CTA", doc.brief.cta],
                  ["Constraints", doc.brief.constraints.join("\n")],
                ] as const
              )
                .filter(([, value]) => value.trim())
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-medium">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
            {doc.brief.facts.length > 0 && (
              <div>
                <h4 className="font-medium">Facts and sources</h4>
                <ul className="mt-1 space-y-2">
                  {doc.brief.facts.map((fact, index) => (
                    <li key={index}>
                      {fact.claim}
                      {fact.sourceUrl && (
                        <a
                          className="ml-2 underline"
                          href={fact.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {doc.brief.assets.length > 0 && (
              <p className="text-muted-foreground">
                {doc.brief.assets.length} reference assets · inspect in the
                brief editor
              </p>
            )}
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
