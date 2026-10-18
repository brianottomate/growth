"use client";
import { ArticleHistory } from "@/components/editorial/ArticleHistory";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type CreativeDocument } from "@/lib/creative-document";

export function CreativeDocumentWorkspace({
  documentId,
}: {
  documentId: string;
}) {
  const client = useQueryClient();
  const query = useQuery({
    ...orpc.creativeWork.document.queryOptions({ input: { documentId } }),
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.run?.status ?? "")
        ? 3000
        : false,
  });
  const refresh = () =>
    client.invalidateQueries({
      queryKey: orpc.creativeWork.key(),
    });
  const save = useMutation(
    orpc.creativeWork.saveDocument.mutationOptions({ onSuccess: refresh }),
  );
  const produce = useMutation(
    orpc.creativeWork.produceDocument.mutationOptions({ onSuccess: refresh }),
  );
  const accept = useMutation(
    orpc.creativeWork.acceptCandidate.mutationOptions({ onSuccess: refresh }),
  );
  const cancel = useMutation(
    orpc.creativeWork.cancelDocumentRun.mutationOptions({ onSuccess: refresh }),
  );
  const pull = useMutation(
    orpc.creativeWork.pullDato.mutationOptions({ onSuccess: refresh }),
  );
  const push = useMutation(
    orpc.creativeWork.pushDato.mutationOptions({ onSuccess: refresh }),
  );
  const [draft, setDraft] = useState<CreativeDocument | null>(null);
  const [itemId, setItemId] = useState("");
  const [platformPostId, setPlatformPostId] = useState("");
  const select = useMutation(
    orpc.creativeWork.selectDocument.mutationOptions({ onSuccess: refresh }),
  );
  if (query.isPending) return <p>Loading document…</p>;
  if (!query.data)
    return <p>{query.error?.message ?? "Document unavailable."}</p>;
  const data = query.data;
  const document = draft ?? data.document;
  const locked =
    data.run?.status === "queued" ||
    data.run?.status === "running" ||
    produce.isPending ||
    pull.isPending ||
    push.isPending;
  const error =
    save.error ??
    produce.error ??
    cancel.error ??
    pull.error ??
    push.error ??
    select.error ??
    accept.error;
  const updateBrief = (
    field: "purpose" | "audience" | "direction" | "cta",
    value: string,
  ) => setDraft({ ...document, brief: { ...document.brief, [field]: value } });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {document.type} document
          </p>
          <h1 className="text-2xl font-semibold">{data.title}</h1>
        </div>
        {data.contentPostId && (
          <Link href={`/app/content/${data.contentPostId}?card=1`}>
            Content item →
          </Link>
        )}
      </div>
      {document.type === "article" && (
        <ArticleHistory
          current={document}
          documentId={documentId}
          disabled={locked || !!draft || save.isPending}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={locked || !draft || save.isPending}
          onClick={() =>
            save.mutate(
              { documentId, document },
              { onSuccess: () => setDraft(null) },
            )
          }
        >
          Save document
        </Button>
        <Button
          variant="outline"
          disabled={locked || !!draft}
          onClick={() => produce.mutate({ documentId })}
        >
          {document.type === "video"
            ? "Write script and scenes"
            : document.type === "image"
              ? "Generate image"
              : document.type === "article"
                ? "Write article"
                : "Write draft"}
        </Button>
        {locked &&
          data.run &&
          !["pull", "push"].includes(data.run.operation) && (
            <Button
              variant="outline"
              onClick={() => cancel.mutate({ runId: data.run!.id })}
            >
              Cancel production
            </Button>
          )}
      </div>
      {locked && <p role="status">Production is running. Editing is locked.</p>}
      {(error || data.run?.error) && (
        <p role="alert" className="text-sm">
          {error?.message ?? data.run?.error}
        </p>
      )}
      <fieldset
        disabled={locked}
        inert={locked}
        className="space-y-4 disabled:opacity-60"
      >
        <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
          {(["purpose", "audience", "direction", "cta"] as const).map(
            (field) => (
              <label key={field} className="space-y-2 text-sm">
                <span className="capitalize">{field}</span>
                <Textarea
                  value={document.brief[field]}
                  onChange={(e) => updateBrief(field, e.target.value)}
                />
              </label>
            ),
          )}
        </div>
        <label className="block space-y-2 text-sm">
          <span>
            Verified facts — one per line, optional source URL after |
          </span>
          <Textarea
            value={document.brief.facts
              .map((f) => f.claim + (f.sourceUrl ? ` | ${f.sourceUrl}` : ""))
              .join("\n")}
            onChange={(e) =>
              setDraft({
                ...document,
                brief: {
                  ...document.brief,
                  facts: e.target.value
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => {
                      const [claim, sourceUrl] = line.split(" | ");
                      return {
                        claim: claim!,
                        ...(sourceUrl ? { sourceUrl } : {}),
                      };
                    }),
                },
              })
            }
          />
        </label>
        <label className="block space-y-2 text-sm">
          Constraints — one per line
          <Textarea
            value={document.brief.constraints.join("\n")}
            onChange={(e) =>
              setDraft({
                ...document,
                brief: {
                  ...document.brief,
                  constraints: e.target.value.split("\n"),
                },
              })
            }
          />
        </label>
        <details>
          <summary className="cursor-pointer text-sm">
            Reference images ({document.brief.assets.length} selected)
          </summary>
          <div className="mt-3 grid max-h-64 grid-cols-2 gap-3 overflow-y-auto">
            {data.assets.map((asset) => (
              <label
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
                key={asset.id}
              >
                <input
                  type="checkbox"
                  checked={document.brief.assets.some(
                    (a) => a.assetId === asset.id,
                  )}
                  onChange={(e) =>
                    setDraft({
                      ...document,
                      brief: {
                        ...document.brief,
                        assets: e.target.checked
                          ? [
                              ...document.brief.assets,
                              { assetId: asset.id, role: "reference" },
                            ]
                          : document.brief.assets.filter(
                              (a) => a.assetId !== asset.id,
                            ),
                      },
                    })
                  }
                />
                {asset.url && (
                  <img
                    className="size-12 rounded object-cover"
                    src={asset.url}
                    alt=""
                  />
                )}
                <span>{asset.title ?? "Untitled image"}</span>
              </label>
            ))}
          </div>
        </details>
        {document.type === "article" && (
          <div className="space-y-3">
            {(["title", "slug", "description"] as const).map((field) => (
              <label key={field} className="block space-y-1 text-sm">
                <span>{field}</span>
                <Input
                  value={document.content[field] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...document,
                      content: { ...document.content, [field]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            <label className="block space-y-1 text-sm">
              Hero image
              <select
                className="w-full rounded-md border bg-background p-2"
                value={document.content.heroAssetId ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...document,
                    content: {
                      ...document.content,
                      heroAssetId: e.target.value || undefined,
                    },
                  })
                }
              >
                <option value="">Choose a library image</option>
                {data.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title ?? "Untitled image"}
                  </option>
                ))}
              </select>
            </label>
            <Textarea
              className="min-h-96"
              value={document.content.bodyMarkdown}
              onChange={(e) =>
                setDraft({
                  ...document,
                  content: {
                    ...document.content,
                    bodyMarkdown: e.target.value,
                  },
                })
              }
            />
            {document.content.review && (
              <div className="rounded-lg border p-4">
                <p>{document.content.review.verdict.replaceAll("_", " ")}</p>
                <ul className="list-disc pl-5">
                  {document.content.review.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {document.type === "image" && (
          <div className="space-y-3">
            {(
              ["composition", "overlayCopy", "avoid", "aspectRatio"] as const
            ).map((field) => (
              <label key={field} className="block space-y-1 text-sm">
                <span>{field}</span>
                <Textarea
                  value={document.content[field]}
                  onChange={(e) =>
                    setDraft({
                      ...document,
                      content: { ...document.content, [field]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
          </div>
        )}
        {document.type === "image" && data.run?.status === "succeeded" && (
          <div className="grid grid-cols-2 gap-3">
            {data.run.candidates.map((candidate, index) => (
              <div key={candidate.url} className="space-y-2">
                <img
                  src={candidate.url}
                  alt={`Generated option ${index + 1}`}
                  className="w-full rounded-lg"
                />
                <Button
                  variant="outline"
                  disabled={
                    accept.isPending || !!data.run?.acceptedMediaAssetId
                  }
                  onClick={() =>
                    accept.mutate({
                      runId: data.run!.id,
                      candidateIndex: index,
                    })
                  }
                >
                  {data.run?.acceptedMediaAssetId
                    ? "Saved to library"
                    : "Save to library"}
                </Button>
              </div>
            ))}
          </div>
        )}
        {document.type === "email" &&
          data.channels
            .filter((c) => c.selected)
            .map((c) => (
              <Link
                className="block underline"
                key={c.id}
                href={`/app/newsletters/${c.id}`}
              >
                Open email editor and preview →
              </Link>
            ))}
        {document.type === "video" && (
          <div className="space-y-3">
            <label className="block text-sm">
              Script
              <Textarea
                className="min-h-60"
                value={document.content.script}
                onChange={(e) =>
                  setDraft({
                    ...document,
                    content: { ...document.content, script: e.target.value },
                  })
                }
              />
            </label>
            <label className="block text-sm">
              Audio direction
              <Textarea
                value={document.content.audioDirection}
                onChange={(e) =>
                  setDraft({
                    ...document,
                    content: {
                      ...document.content,
                      audioDirection: e.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="flex gap-4">
              <label className="text-sm">
                Target duration (seconds)
                <Input
                  type="number"
                  min={1}
                  max={3600}
                  value={document.content.durationSeconds ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...document,
                      content: {
                        ...document.content,
                        durationSeconds: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      },
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Aspect ratio
                <Input
                  value={document.content.aspectRatio}
                  onChange={(e) =>
                    setDraft({
                      ...document,
                      content: {
                        ...document.content,
                        aspectRatio: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            {document.content.scenes.map((scene, index) => (
              <div key={scene.id} className="space-y-3 rounded-lg border p-3">
                <p className="font-medium">Scene {index + 1}</p>
                <label className="block text-sm">
                  Duration (seconds)
                  <Input
                    type="number"
                    min={1}
                    value={scene.durationSeconds}
                    onChange={(e) =>
                      setDraft({
                        ...document,
                        content: {
                          ...document.content,
                          scenes: document.content.scenes.map((s) =>
                            s.id === scene.id
                              ? {
                                  ...s,
                                  durationSeconds: Number(e.target.value),
                                }
                              : s,
                          ),
                        },
                      })
                    }
                  />
                </label>
                {(
                  [
                    "direction",
                    "narration",
                    "overlayCopy",
                    "transition",
                  ] as const
                ).map((field) => (
                  <label className="block space-y-1 text-sm" key={field}>
                    <span>
                      {field === "overlayCopy" ? "On-screen text" : field}
                    </span>
                    <Textarea
                      value={scene[field] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...document,
                          content: {
                            ...document.content,
                            scenes: document.content.scenes.map((s) =>
                              s.id === scene.id
                                ? { ...s, [field]: e.target.value }
                                : s,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...document,
                      content: {
                        ...document.content,
                        scenes: document.content.scenes.filter(
                          (s) => s.id !== scene.id,
                        ),
                      },
                    })
                  }
                >
                  Remove scene
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setDraft({
                  ...document,
                  content: {
                    ...document.content,
                    scenes: [
                      ...document.content.scenes,
                      {
                        id: crypto.randomUUID(),
                        direction: "",
                        durationSeconds: 5,
                        narration: "",
                        overlayCopy: "",
                        sourceAssetIds: [],
                      },
                    ],
                  },
                })
              }
            >
              Add scene
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <select
            className="min-w-48 rounded-md border bg-background p-2"
            value={platformPostId}
            onChange={(e) => setPlatformPostId(e.target.value)}
          >
            <option value="">Choose channel version</option>
            {data.channels
              .filter((c) =>
                document.type === "email"
                  ? c.platform === "newsletter"
                  : document.type === "article"
                    ? c.platform === "blog"
                    : !["blog", "newsletter"].includes(c.platform),
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.platform}
                  {c.selected ? " · selected" : ""}
                </option>
              ))}
          </select>
          <Button
            variant="outline"
            disabled={!platformPostId || !!draft}
            onClick={() => select.mutate({ documentId, platformPostId })}
          >
            Use on channel
          </Button>
        </div>
        {document.type === "article" && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm">
              Pull replaces this local article. Push replaces the Dato draft.
              Neither publishes.
            </p>
            <Input
              placeholder="Dato article ID (for first pull)"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!!draft}
                onClick={() =>
                  pull.mutate({ documentId, itemId: itemId || undefined })
                }
              >
                Pull from Dato
              </Button>
              <Button
                variant="outline"
                disabled={!!draft}
                onClick={() => push.mutate({ documentId })}
              >
                Push to Dato draft
              </Button>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
